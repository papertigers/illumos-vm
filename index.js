const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const fs = require("fs");
const path = require("path");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function execSSH(cmd, desp = "") {
  core.info(desp);
  core.info("exec ssh: " + cmd);
  await exec.exec("ssh -t omnios", [], { input: cmd });
}



async function getScreenText(vmName) {
  let png = path.join(__dirname, "/screen.png");
  await exec.exec("sudo vboxmanage",
    ["controlvm", vmName, "screenshotpng", png], { silent: true } );
  await exec.exec("sudo chmod 666 " + png, [], { silent: true });
  let output = "";
  await exec.exec("pytesseract  " + png, [], {
    silent: true,
    listeners: {
      stdout: (s) => {
        output += s;
      }
    }
  });
  return output;
}

async function waitFor(vmName, tag) {

  let slept = 0;
  while (true) {
    if (slept >= 300) {
      throw new Error("Timeout can not boot");
    }
    await sleep(1000);

    let output = await getScreenText(vmName);

    if (tag) {
      if (output.includes(tag)) {
        core.info("OK");
        await sleep(1000);
        return true;
      } else {
        if ((slept % 10) === 0) {
            core.info("Sleep counter: " + slept +
                " - Checking, please wait....");
        }
      }
    } else {
      if (!output.trim()) {
        core.info("OK");
        return true;
      } else {
        core.info("Checking, please wait....");
      }
    }

    slept += 1;

  }

  return false;
}


async function vboxmanage(vmName, cmd, args = "") {
  await exec.exec("sudo  vboxmanage " + cmd + "   " + vmName + "   " + args);
}

async function setup(nat, mem) {
  try {

    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        "Host omnios " + "\n");
    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        " User root" + "\n");
    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        " HostName localhost" + "\n");
    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        " Port 2222" + "\n");
    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        " StrictHostKeyChecking=accept-new\n");

    await exec.exec("brew install -qf tesseract", [], { silent: true });
    await exec.exec("pip3 install -q pytesseract", [], { silent: true });

    let workingDir = __dirname;

    let url = "https://github.com/papertigers/gh-illumos-builder/releases/download/v0.0.5/omnios-r151038.7z";

    core.info("Downloading image: " + url);
    let img = await tc.downloadTool(url);
    core.info("Downloaded file: " + img);

    let s7z = workingDir + "/omnios-r151038.7z";
    await io.mv(img, s7z);
    await exec.exec("7z e " + s7z + "  -o" + workingDir);

    let sshHome = path.join(process.env["HOME"], ".ssh");
    fs.appendFileSync(path.join(sshHome, "config"),
        "SendEnv   CI  GITHUB_* \n");
    await exec.exec("chmod 700 " + sshHome);

    let vmName = "omnios";
    let ova = "omnios-r151038.ova";
    let diskPath = "/var/root/VirtualBox\ VMs/omnios/omnios-r151038-disk001.vmdk";
    await vboxmanage("", "import", path.join(workingDir, ova));

    if (nat) {
      let nats = nat.split("\n").filter(x => x !== "");
      for (let element of nats) {
        core.info("Add nat: " + element);
        let segs = element.split(":");
        if (segs.length === 3) {
          //udp:"8081": "80"
          let proto = segs[0].trim().trim('"');
          let hostPort = segs[1].trim().trim('"');
          let vmPort = segs[2].trim().trim('"');
          await vboxmanage(vmName, "modifyvm", "  --natpf1 '" + hostPort + "," +
            proto + ",," + hostPort + ",," + vmPort + "'");

        } else if (segs.length === 2) {
          let proto = "tcp"
          let hostPort = segs[0].trim().trim('"');
          let vmPort = segs[1].trim().trim('"');
          await vboxmanage(vmName, "modifyvm", "  --natpf1 '" + hostPort + "," +
            proto + ",," + hostPort + ",," + vmPort + "'");
        }
      };
    }

    if (mem) {
      await vboxmanage(vmName, "modifyvm", "  --memory " + mem);
    }

    // XXX Ditch the Sata controller in favor of a faster nvme controller?
    await vboxmanage(vmName, "storagectl", " --name SATA --remove" );
    await vboxmanage(vmName, "storagectl", " --add pcie --controller NVMe --name NVME" );
    await vboxmanage(vmName, "storageattach", " --storagectl NVME --port 0 --device -0 --type hdd --medium " + diskPath );
    await vboxmanage(vmName, "storagectl", " --name NVME --hostiocache on" );
    // XXX


    await vboxmanage(vmName, "modifyvm", " --cpus 3");

    await vboxmanage(vmName, "startvm", " --type headless");

    core.info("First boot");

    let loginTag = "omnios console login:";
    await waitFor(vmName, loginTag);

    // XXX need an smf service that outputs when ssh is up
    await sleep(1000 * 60 * 2);

    // Finally execute the runner workflow
    let cmd1 = "mkdir -p /Users/runner/work && ln -s /Users/runner/work/  work";
    await execSSH(cmd1, "Setting up VM");
    await exec.exec("rsync -auvzrtopg  --exclude _actions/papertigers/illumos-vm  /Users/runner/work/ omnios:work");

    core.info("OK, Ready!");

  }
  catch (error) {
    core.setFailed(error.message);
  }
}



async function main() {
  let nat = core.getInput("nat");
  core.info("nat: " + nat);

  let mem = core.getInput("mem");
  core.info("mem: " + mem);

  await setup(nat, mem);

  var envs = core.getInput("envs");
  console.log("envs:" + envs);
  if (envs) {
    fs.appendFileSync(path.join(process.env["HOME"], "/.ssh/config"),
        "SendEnv " + envs + "\n");
  }

  var prepare = core.getInput("prepare");
  if (prepare) {
    core.info("Running prepare: " + prepare);
    await exec.exec("ssh -t omnios", [], { input: prepare });
  }

  var run = core.getInput("run");
  console.log("run: " + run);

  try {
    await exec.exec("ssh omnios sh -c 'cd $GITHUB_WORKSPACE && exec bash'", [], { input: run });
  } catch (error) {
    core.setFailed(error.message);
  } finally {
    core.info("get back by rsync");
    await exec.exec("rsync -uvzrtopg  omnios:work/ /Users/runner/work");
  }
}



main().catch(ex => {
  core.setFailed(ex.message);
});


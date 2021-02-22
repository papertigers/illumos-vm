#!/usr/bin/env bash

set -xe

# TODO add error handling
TOP=$(cd "$(dirname "$0")" && pwd)

mkdir "$TOP/ILLUMOSVM_TMP"
mkdir -p "$HOME/.ssh"
ssh-keygen -t rsa -f "$HOME/.ssh/id_rsa" -q -N ""

mkdir -p "$TOP/ILLUMOSVM/cpio"
cat "$HOME/.ssh/id_rsa.pub" > "$HOME/.ssh/authorized_keys"
cp "$HOME/.ssh/authorized_keys" "$TOP/ILLUMOSVM/cpio/authorized_keys"

cat >"$TOP/ILLUMOSVM/cpio/firstboot.sh" <<EOF
#!/bin/bash
set -o errexit
set -o pipefail
set -o xtrace

echo 'Just a moment...' >/dev/msglog
/bin/sed -i \\
    -e '/^PATH=/s#\$#:/opt/ooce/bin:/opt/ooce/sbin#' \\
    /etc/default/login
/bin/ntpdig -S 0.pool.ntp.org || true
(
    echo
    echo
    banner 'Welcome to OmniOS!'
    echo
    echo
) >/dev/msglog
exit 0
EOF

echo omnios > "$TOP/ILLUMOSVM/cpio/nodename"
cd "$TOP/ILLUMOSVM/cpio"
# macOS versions are very picky it seems....dmg works on 11.2.1 but not 10.15.7
find . -type f | cpio --quiet -o -O "$TOP/ILLUMOSVM_TMP/metadata.img"
ls -lh "$TOP/ILLUMOSVM_TMP/metadata.img"
file "$TOP/ILLUMOSVM_TMP/metadata.img"
hdiutil imageinfo --verbose "$TOP/ILLUMOSVM_TMP/metadata.img"
cd "$TOP"

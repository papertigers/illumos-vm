#!/usr/bin/env bash

set -xe

# TODO add error handling
TOP=$(cd "$(dirname "$0")" && pwd)

# installed via brew
cpio="/usr/local/opt/cpio/bin/cpio"

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

/bin/sed -i \\
    -e '/^PATH=/s#\$#:/opt/ooce/bin:/opt/ooce/sbin#' \\
    /etc/default/login
/bin/ntpdig -S 0.pool.ntp.org || true

# break out of sercons?
(
    echo -ne '\r\nVM is read ~*~*'
) >/dev/msglog
exit 0
EOF

echo omnios > "$TOP/ILLUMOSVM/cpio/nodename"
cd "$TOP/ILLUMOSVM/cpio"
find . -type f | "$cpio" --quiet -o -O "$TOP/ILLUMOSVM_TMP/metadata.img"
# installed via brew
truncate -s 1M "$TOP/ILLUMOSVM_TMP/metadata.img"
cd "$TOP"

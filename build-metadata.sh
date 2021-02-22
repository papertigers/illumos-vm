#!/usr/bin/env bash

# TODO add error handling

TOP=$(cd "$(dirname "$0")" && pwd)

ssh-keygen -t rsa -f "$HOME/.ssh/id_rsa" -q -N ""

mkdir -p "$TOP/input/cpio"
cp "$HOME/.ssh/authorized_keys" "$TOP/input/cpio/authorized_keys"

cat >"$TOP/input/cpio/firstboot.sh" <<EOF
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

echo omnios > "$TOP/input/cpio/nodename"
cd "$TOP/input/cpio"
# macOS seems to want the dmg extension...
find . -type f | cpio --quiet -o -O "$TOP/tmp/metadata.dmg"
cd "$TOP"

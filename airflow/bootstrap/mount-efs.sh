#!/usr/bin/env bash

set -Eeuxo pipefail

MOUNT_POINT="/mount/efs"
mkdir -p $MOUNT_POINT
mount -t efs $EFS_FILE_SYSTEM_ID $MOUNT_POINT
#!/usr/bin/env bash

set -Eeuxo pipefail


sudo mount -t efs ${EFS_FILE_SYSTEM_ID}:/ ${MOUNT_POINT}

ls ${SWEEP_DIR}
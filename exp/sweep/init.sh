#!/usr/bin/env bash

set -Eeuxo pipefail

echo "
[mount]
region=${AWS_REGION}" | crudini --merge /etc/amazon/efs/efs-utils.conf

mount -t efs ${EFS_FILE_SYSTEM_ID} ${MOUNT_POINT}/

ls ${SWEEP_DIR}

wandb login

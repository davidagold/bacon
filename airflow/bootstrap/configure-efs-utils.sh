#!/usr/bin/env bash

set -Eeuxo pipefail

echo "
[mount]
region=${AWS_REGION}" | crudini --merge /etc/amazon/efs/efs-utils.conf
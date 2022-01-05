#!/usr/bin/env bash

set -Eeuxo pipefail

airflow db init
# sleep 5

airflow users create -r Admin -u admin -f FirstName -l LastName -p ${ADMIN_PASS} -e admin@test.com
# sleep 5

sudo mount \
    -t nfs4 \
    -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport \
    ${EFS_FILE_SYSTEM_ID}.efs.${AWS_REGION}.amazonaws.com \
    ${MOUNT_POINT}

airflow webserver
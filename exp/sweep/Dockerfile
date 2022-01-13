FROM python:3.8-slim

WORKDIR /usr/app

RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    apt install -y git curl build-essential binutils nfs-common

RUN git clone https://github.com/aws/efs-utils /usr/tmp/efs-utils && \
    (cd /usr/tmp/efs-utils && ./build-deb.sh && \ 
    apt-get -y install ./build/amazon-efs-utils*deb)
RUN test -f /sbin/mount.efs && echo "${EFS_FILE_SYSTEM_ID}:/ ${MOUNT_POINT}/ efs defaults,user" >> /etc/fstab

RUN DEBIAN_FRONTEND=noninteractive pip3 install --upgrade pip && \
    pip3 install --no-cache-dir \
    torch==1.10.0 \
    torchvision==0.11.1 \
    -f https://download.pytorch.org/whl/torch_stable.html

RUN pip3 --no-cache-dir install --upgrade awscli
RUN pip3 install wandb

ARG MOUNT_POINT
ENV MOUNT_POINT=${MOUNT_POINT}
RUN mkdir -p ${MOUNT_POINT} && chmod 777 -R ${MOUNT_POINT}

RUN apt-get install -y crudini

COPY init.sh .
ENTRYPOINT [ "/bin/bash", "init.sh" ]
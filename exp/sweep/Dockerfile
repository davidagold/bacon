FROM python:3.8-slim

WORKDIR /usr/app
ARG AWS_ROOT="/usr/bin/aws"

RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    apt install -y git curl build-essential binutils

RUN git clone https://github.com/aws/efs-utils /usr/tmp/efs-utils && \
    (cd /usr/tmp/efs-utils && ./build-deb.sh && \ 
    apt-get -y install ./build/amazon-efs-utils*deb)

RUN DEBIAN_FRONTEND=noninteractive pip3 install --upgrade pip && \
    pip3 install --no-cache-dir \
    torch==1.10.0 \
    torchvision==0.11.1 \
    -f https://download.pytorch.org/whl/torch_stable.html

RUN pip3 --no-cache-dir install --upgrade awscli

ARG MOUNT_POINT
ENV MOUNT_POINT=${MOUNT_POINT}
RUN mkdir -p ${MOUNT_POINT}

ARG SWEEP_DIR
ENV SWEEP_DIR=${SWEEP_DIR}

COPY init.sh .
ENTRYPOINT [ "init.sh" ]
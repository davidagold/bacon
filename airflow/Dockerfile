FROM apache/airflow:2.2.2-python3.8


ENV AIRFLOW_HOME=/usr/local/airflow
ENV AIRFLOW_USER=airflow
WORKDIR ${AIRFLOW_HOME}
USER root

RUN apt-get update && apt-get install -y python3-pip \
    libcurl4-gnutls-dev \
    librtmp-dev

RUN apt-get -y install git binutils nfs-kernel-server nfs-common rpcbind && \
    git clone https://github.com/aws/efs-utils /tmp/efs-utils && \
    (cd /tmp/efs-utils && \
        ./build-deb.sh && \ 
        apt-get -y install ./build/amazon-efs-utils*deb)

ARG AWS_REGION
ARG EFS_FILE_SYSTEM_ID
ENV efs_mount_point_1=/mount/efs
RUN mkdir -p ${efs_mount_point_1}
RUN test -f /sbin/mount.efs && echo ${EFS_FILE_SYSTEM_ID}:/ ${efs_mount_point_1} efs defaults,${AIRFLOW_USER} >> /etc/fstab || \
    echo "${EFS_FILE_SYSTEM_ID}.efs.${AWS_REGION}.amazonaws.com:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,${AIRFLOW_USER} 0 0" >> /etc/fstab

COPY ./bootstrap/* /bootstrap/

RUN chown -R airflow: ${AIRFLOW_HOME} /bootstrap
USER $AIRFLOW_USER

COPY requirements.txt .
RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install -r requirements.txt
RUN export PATH=~/.local/bin:$PATH && \
    aws --version

EXPOSE 8080-8082
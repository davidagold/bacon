FROM apache/airflow:2.2.2-python3.8


ENV AIRFLOW_HOME=/usr/local/airflow
ENV AIRFLOW_USER=airflow
WORKDIR ${AIRFLOW_HOME}
USER root

RUN apt-get update && apt-get install -y python3-pip \
    libcurl4-gnutls-dev \
    librtmp-dev

RUN apt-get -y install git binutils nfs-common && \
    git clone https://github.com/aws/efs-utils /tmp/efs-utils && \
    (cd /tmp/efs-utils && \
        ./build-deb.sh && \ 
        apt-get -y install ./build/amazon-efs-utils*deb)

ARG AWS_REGION
ARG EFS_FILE_SYSTEM_ID
ARG MOUNT_POINT
RUN mkdir -p ${MOUNT_POINT}
RUN test -f /sbin/mount.efs && echo ${EFS_FILE_SYSTEM_ID}:/ ${MOUNT_POINT} efs defaults,user,_netdev >> /etc/fstab || \
    echo "${EFS_FILE_SYSTEM_ID}.efs.${AWS_REGION}.amazonaws.com:/ ${MOUNT_POINT} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,user,_netdev 0 0" >> /etc/fstab
RUN chmod 777 -R ${MOUNT_POINT}

COPY ./bootstrap/* /bootstrap/
RUN apt-get install -y crudini && \
    source /bootstrap/configure-efs-utils.sh

# Let user `airflow` run mount
RUN echo "airflow ALL = NOPASSWD: /bin/mount" | sudo EDITOR='tee -a' visudo

RUN chown -R ${AIRFLOW_USER}: ${AIRFLOW_HOME} /bootstrap
USER ${AIRFLOW_USER}

COPY requirements.txt .
RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install -r requirements.txt
RUN export PATH=~/.local/bin:$PATH && \
    aws --version

EXPOSE 2049
EXPOSE 5432
EXPOSE 8080-8082
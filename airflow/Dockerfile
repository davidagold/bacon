FROM apache/airflow:2.2.2-python3.8


ENV AIRFLOW_HOME=/usr/local/airflow
WORKDIR ${AIRFLOW_HOME}
USER root

RUN apt-get update && apt-get install -y python3-pip \
    libcurl4-gnutls-dev \
    librtmp-dev

RUN apt-get -y install git binutils && \
    git clone https://github.com/aws/efs-utils /tmp/efs-utils && \
    (cd /tmp/efs-utils && \
        ./build-deb.sh && \ 
        apt-get -y install ./build/amazon-efs-utils*deb)

COPY ./bootstrap/* /bootstrap/

RUN chown -R airflow: ${AIRFLOW_HOME} /bootstrap
USER airflow

COPY requirements.txt .
RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install -r requirements.txt
RUN export PATH=~/.local/bin:$PATH && \
    aws --version

EXPOSE 8080-8082
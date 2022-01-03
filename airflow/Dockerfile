FROM apache/airflow:2.2.2-python3.8


ENV AIRFLOW_HOME=/usr/local/airflow
WORKDIR ${AIRFLOW_HOME}

USER root

RUN apt-get update && apt-get install -y python3-pip \
    libcurl4-gnutls-dev \
    librtmp-dev

RUN python3 -m pip install --upgrade pip

RUN python3 -m pip install awscli
RUN export PATH=~/.local/bin:$PATH && \
    aws --version

COPY ./bootstrap/* /bootstrap/

EXPOSE 8080-8082
RUN chown -R airflow: ${AIRFLOW_HOME} /bootstrap
USER airflow

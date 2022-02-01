FROM apache/airflow:2.2.2-python3.8


ENV AIRFLOW_HOME=/usr/local/airflow
ENV AIRFLOW_USER=airflow
WORKDIR ${AIRFLOW_HOME}
USER root

RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-key 467B942D3A79BD29 && \
    apt-get update && apt-get install -y python3-pip \
        libcurl4-gnutls-dev \
        librtmp-dev
RUN pip install --upgrade apache-airflow-providers-google

ARG MOUNT_POINT
RUN mkdir -p ${MOUNT_POINT}

COPY ./bootstrap/* /bootstrap/

RUN chown -R ${AIRFLOW_USER}: ${AIRFLOW_HOME} /bootstrap
USER ${AIRFLOW_USER}

COPY requirements.txt .
RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install -r requirements.txt

COPY dags/ ${AIRFLOW_HOME}/dags/

EXPOSE 8080
EXPOSE 8793
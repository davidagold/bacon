SHELL :/bin/bash

.PHONY: venv install image-airflow image-registrar deploy-images deploy test-dag clean

env=staging
sweepTaskImageTag=$(shell cd example/unet && git rev-parse HEAD)
airflowImageTag=$(shell git rev-parse HEAD)
sweepTaskInstanceType="c5.9xlarge"
numSweepTasks=8
maxNumInstances=1


venv:
	virtualenv --python=python3.9 venv

install: venv
	npm install && \
	source venv/bin/activate && \
	pip install -r airflow/requirements.txt && \
	deactivate

image-airflow:
	DOCKER_BUILDKIT=0 docker build \
		-f airflow/Dockerfile \
		-t bacon-airflow:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		airflow

image-registrar:
	DOCKER_BUILDKIT=0 docker build -t bacon-registrar:latest .

deploy-images:
	node_modules/aws-cdk/bin/cdk deploy -a "npx ts-node --prefer-ts-exts cfn/images.ts" --context env=$(env)

deploy:
	node_modules/aws-cdk/bin/cdk deploy \
		--context env=$(env) \
		--context sweepTaskImageTag=$(sweepTaskImageTag) \
		--context airflowImageTag=$(airflowImageTag) \
		--context sweepTaskInstanceType=$(sweepTaskInstanceType) \
		--context numSweepTasks=$(numSweepTasks) \
		--context maxNumInstances=$(maxNumInstances)

test-dag: install
	source venv/bin/activate; \
	SUBNET_IDS="a,b" \
	AWS_LOG_STREAM_PREFIX_SWEEP="bacon/sweeps" \
	N_SWEEP_TASKS=8 \
	python airflow/dags/sweep_dag.py; \
	deactivate

clean:
	rm -rf venv dist

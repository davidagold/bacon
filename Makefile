SHELL :/bin/bash

.PHONY: image-airflow image-registrar deploy-images deploy

env=staging

image-airflow:
	DOCKER_BUILDKIT=0 docker build \
		-f airflow/Dockerfile \
		-t bacon-airflow:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		airflow

image-registrar:
	DOCKER_BUILDKIT=0 docker build -t bacon-registrar:latest .

deploy-images:
	cdk deploy -a "npx ts-node --prefer-ts-exts cfn/images.ts" --context env=$(env)

deploy:
	cdk deploy --context env=$(env)

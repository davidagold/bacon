SHELL :/bin/bash

.PHONY: image deploy-images

env=staging

image-airflow:
	DOCKER_BUILDKIT=0 docker build \
		-f airflow/Dockerfile \
		-t bacon-airflow:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		airflow

image-registrar:
	DOCKER_BUILDKIT=0 docker build \
		-f Dockerfile \
		-t bacon-registrar:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} \
		.

deploy-images:
	cdk deploy -a "npx ts-node --prefer-ts-exts cfn/images.ts" --context env=$(env)
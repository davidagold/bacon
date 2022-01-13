SHELL :/bin/bash

.PHONY: image

image-airflow:
	DOCKER_BUILDKIT=0 docker build \
		-f Dockerfile/airflow.dockerfile \
		-t bacon-airflow:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		airflow

image-registrar:
	DOCKER_BUILDKIT=0 docker build \
		-f Dockerfile.registrar \
		-t bacon-registrar:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} \
		.

image-sweep:
	DOCKER_BUILDKIT=0 docker build \
		-f exp/sweep/Dockerfile \
		-t bacon-sweep:latest \
		--build-arg MOUNT_POINT="/mnt/efs" \
		--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} \
		exp/sweep
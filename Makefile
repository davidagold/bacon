SHELL :/bin/bash

.PHONY: image


image-registrar:
	DOCKER_BUILDKIT=0 docker build \
		-f Dockerfile.registrar \
		-t bacon-registrar:latest \
		--build-arg MOUNT_POINT="/mount/efs" \
		--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} . 

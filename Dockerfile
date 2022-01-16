FROM public.ecr.aws/lambda/nodejs:14

RUN npm install -g npm

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package* ./
COPY src/ ./src/
COPY tsconfig.json .

ARG MOUNT_POINT
ENV MOUNT_POINT=${MOUNT_POINT}

ARG NPM_TOKEN
ENV NPM_TOKEN=${NPM_TOKEN}
RUN echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > .npmrc
RUN npm install && npm run build

CMD [ "dist/registrar/handler.main" ]
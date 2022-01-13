import { Aws, aws_codebuild, Fn } from "aws-cdk-lib"
import { IRepository } from "aws-cdk-lib/aws-ecr"
import { IRole } from "aws-cdk-lib/aws-iam"
import { Construct } from "constructs"

import { config } from "../../../src/config"
import { SWEEP_DIR } from "../../../src/experiments/sweep"


interface SweepTaskImageProps {
    dockerRepo: IRepository
    serviceRole: IRole
}

export class SweepTaskImage extends Construct {

    constructor(scope: Construct, id: string, props: SweepTaskImageProps) {
        super(scope, id)

        let gitHubSource = aws_codebuild.Source.gitHub({
            owner: "dag-org",
            repo: "bacon",
            webhook: true,
            webhookFilters: [
                aws_codebuild.FilterGroup
                    .inEventOf(aws_codebuild.EventAction.PUSH)
                    .andCommitMessageIsNot("^.*skip\\-build\\-sweep.*$")
            ]
        })

        let ecrRegistry = Fn.sub("${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com")
        let dockerRepoName = props.dockerRepo.repositoryName.toString()

        let tagCommitEcrBase = "${ecrRegistry}/${dockerRepoName}"
        let tagLatest = "${dockerRepoName}:latest"
        let tagLatestEcr = `\${ecrRegistry}/${tagLatest}`
        let environmentVariables = {
            NPM_TOKEN_READ_ONLY: {
                type: aws_codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                value: "NpmTokenReadOnlySecret:NPM_TOKEN_READ_ONLY"
            },
            AWS_REGION: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Aws.REGION
            },
            DOCKER_REPO: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: dockerRepoName
            },
            ECR_REGISTRY: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: ecrRegistry
            },
            MOUNT_POINT: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: config.EFS_MOUNT_POINT
            },
            SWEEP_DIR: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: SWEEP_DIR
            },
            TAG_COMMIT_ECR_BASE: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagCommitEcrBase, { ecrRegistry, dockerRepoName })
            },
            TAG_LATEST_ECR: {
                type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagLatestEcr, { dockerRepoName, ecrRegistry })
            }
        }

        let buildSpec = aws_codebuild.BuildSpec.fromObjectToYaml({
            version: "0.2",
            phases: {
                install: {
                    commands: [
                        "nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock "
                        + "-host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &",
                        "timeout 15 sh -c \"until docker info; do echo .; sleep 1; done\""
                    ]
                  },
                  pre_build: {
                    commands : [
                        "echo Logging in to Amazon ECR...",
                        "aws ecr get-login-password --region ${AWS_REGION} | "
                        + "docker login --username AWS --password-stdin "
                        + "${ECR_REGISTRY}"
                    ]
                  },
                  build: {
                    commands: [
                        "docker build "
                        + "-f exp/sweep/Dockerfile "
                        + "-t ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} "
                        + "--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} "
                        + "--build-arg MOUNT_POINT=${MOUNT_POINT} "
                        + "exp/sweep"
                    ]
                  },
                  post_build: {
                    commands: [
                        "docker tag ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} ${TAG_COMMIT_ECR_BASE}:${CODEBUILD_RESOLVED_SOURCE_VERSION}",
                        "docker tag ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} ${TAG_LATEST_ECR}",
                        "docker push ${TAG_COMMIT_ECR_BASE}:${CODEBUILD_RESOLVED_SOURCE_VERSION}",
                        "docker push ${TAG_LATEST_ECR}"
                    ]
                }
            }
        })

        new aws_codebuild.Project(this, "SweepExperimentProject", {
            source: gitHubSource,
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.STANDARD_4_0,
                computeType: aws_codebuild.ComputeType.SMALL,
                privileged: true,
            },
            environmentVariables: environmentVariables,
            role: props.serviceRole,
            buildSpec: buildSpec,
        })
    }
}

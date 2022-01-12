import { config } from "../../src/config"
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Fn, Stack, App, Aws, CfnOutput } from "aws-cdk-lib"
import { Construct } from "constructs"
import { Template } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement, Effect, IRole } from "aws-cdk-lib/aws-iam";
import { IRepository, Repository } from "aws-cdk-lib/aws-ecr";
import { statements } from "./src/statements"

const cf = require('@mapbox/cloudfriend')
const artifacts = require("@davidagold/artifacts")


let airflowRepositoryName = cf.join("-", [cf.stackName, "airflow"])

let Resources = {
    AirflowImageRepository: {
        Type: "AWS::ECR::Repository",
        Properties: {
            RepositoryName: airflowRepositoryName,
        }
    }
}

let Outputs = {
    AirflowImageRepositoryArn: {
        Description: "ARN of Airflow Docker image repository",
        Value: cf.getAtt("AirflowImageRepository", "Arn"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryArn"])
        }
    },
    AirflowRepositoryUri: {
        Description: "URI of Airflow Docker image repository",
        Value: cf.getAtt("AirflowImageRepository", "RepositoryUri"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryUri"])
        }
    }
}

let npmTokenReadAccessStatement = {
    Sid: "NpmTokenSecretStatement",
    Effect: "Allow",
    Action: "secretsmanager:GetSecretValue",
    Resource: "arn:aws:secretsmanager:us-east-2:510666016636:secret:NpmTokenReadOnlySecret-KOrg9f"
}

let npmTokenEnvVar = {
    Name: "NPM_TOKEN_READ_ONLY",
    Type: "SECRETS_MANAGER",
    Value: "NpmTokenReadOnlySecret:NPM_TOKEN_READ_ONLY"
}

let airflowDockerArtifact = artifacts.docker({
    GitHubAccount: "dag-org",
    GitHubRepositoryName: "bacon",
    EcrRepositoryName: airflowRepositoryName,
    PrivilegedMode: true,
    EnvironmentVariables: [
        npmTokenEnvVar,
        { Name: "MOUNT_POINT", Value: config.EFS_MOUNT_POINT }
    ],
    InstallCommands: [
        "nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock " +
            "-host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &",
        "timeout 15 sh -c \"until docker info; do echo .; sleep 1; done\""
    ],
    BuildCommands: [
        "(cd airflow && " +
        "docker build " +
        // `dockerRepo` is resolved by artifacts
        "-t ${dockerRepo}:${!CODEBUILD_RESOLVED_SOURCE_VERSION} " + 
        "--build-arg NPM_TOKEN=${!NPM_TOKEN_READ_ONLY} " +
        "--build-arg MOUNT_POINT=${!MOUNT_POINT} .)"
    ],
    ServiceRoleStatements: [npmTokenReadAccessStatement]
})


interface RegistrarImageProps {
    dockerRepo: IRepository
    serviceRole: IRole
}

class RegistrarImage extends Construct {

    constructor(scope: Construct, id: string, props: RegistrarImageProps) {
        super(scope, id)

        let gitHubSource = codebuild.Source.gitHub({
            owner: "dag-org",
            repo: "bacon",
            webhook: true,
            webhookFilters: [
                codebuild.FilterGroup
                    .inEventOf(codebuild.EventAction.PUSH)
                    .andCommitMessageIsNot("^.*skip\\-build.*$")
            ]
        })

        let ecrRegistry = Fn.sub("${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com")
        let dockerRepoName = props.dockerRepo.repositoryName.toString()

        let tagCommitEcrBase = "${ecrRegistry}/${dockerRepoName}"
        let tagLatest = "${dockerRepoName}:latest"
        let tagLatestEcr = `\${ecrRegistry}/${tagLatest}`
        let environmentVariables = {
            NPM_TOKEN_READ_ONLY: {
                type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                value: "NpmTokenReadOnlySecret:NPM_TOKEN_READ_ONLY"
            },
            AWS_REGION: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Aws.REGION
            },
            DOCKER_REPO: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: dockerRepoName
            },
            ECR_REGISTRY: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: ecrRegistry
            },
            MOUNT_POINT: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: config.EFS_MOUNT_POINT
            },
            TAG_COMMIT_ECR_BASE: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagCommitEcrBase, { ecrRegistry, dockerRepoName })
            },
            TAG_LATEST_ECR: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagLatestEcr, { dockerRepoName, ecrRegistry })
            }
        }

        let buildSpec = codebuild.BuildSpec.fromObjectToYaml({
            version: "0.2",
            phases: {
                install: {
                    commands: [
                        "nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock " +
                            "-host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &",
                        "timeout 15 sh -c \"until docker info; do echo .; sleep 1; done\""
                    ]
                  },
                  pre_build: {
                    commands : [
                        "echo Logging in to Amazon ECR...",
                        "aws ecr get-login-password --region ${AWS_REGION} | " + 
                            "docker login --username AWS --password-stdin " +
                            "${ECR_REGISTRY}"
                    ]
                  },
                  build: {
                    commands: [
                        "docker build " +
                        "-f Dockerfile.registrar " +
                        "-t ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} " +
                        "--build-arg NPM_TOKEN=${NPM_TOKEN_READ_ONLY} ."
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

        new codebuild.Project(this, "RegistrarProject", {
            source: gitHubSource,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
                computeType: codebuild.ComputeType.SMALL,
                privileged: true,
            },
            environmentVariables: environmentVariables,
            role: props.serviceRole,
            buildSpec: buildSpec,
        })
    }
}

class Images extends Stack {

    constructor(scope, id, props?) {
        super(scope, id)

        let dockerRepo = new Repository(this, "RegistrarDockerRepository", {
            repositoryName: Fn.join("-", [Aws.STACK_NAME, "registrar"])
        })
        new CfnOutput(this, "RegistrarDkrRepositoryArn", {
            value: dockerRepo.repositoryArn,
            exportName: Fn.join("-", [Aws.STACK_NAME, "RegistrarDkrRepositoryArn"])
        })

        let serviceRole = new Role(this, "RegistrarProjectServiceRole", {
            assumedBy: new ServicePrincipal("codebuild.amazonaws.com"),
            inlinePolicies: {
                CodebuildPolicy: new PolicyDocument({ statements })
            }
        })

        new RegistrarImage(this, "RegistrarImage", { serviceRole, dockerRepo })
    }
}


module.exports = cf.merge(
    { Resources, Outputs }, 
    airflowDockerArtifact,
    Template
        .fromStack(new Images(new App(), "Images"))
        .toJSON()
)

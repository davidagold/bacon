import { SecretValue } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc } from "aws-cdk-lib/aws-ec2";

import { Fn, Aws } from "aws-cdk-lib";
import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import ecr = require("aws-cdk-lib/aws-ecr");
import { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { config, ContainerConfig } from "../../src/config";
import { Service } from "./service";
import { Rds } from "./rds"
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";

import { SweepTask } from "./sweep-task";
import { LOG_STREAM_PREFIX_SWEEP } from "../../exp/sweep/config.json"
import { EfsVolumeInfo } from "../bacon";
import { generateSecret } from "./utils";


export interface AirflowProps {
  readonly vpc: IVpc;
  readonly cluster: ecs.ICluster;
  readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
  readonly subnets: ec2.ISubnet[];
  readonly volumeInfo: EfsVolumeInfo
  readonly sweepTask: SweepTask
  readonly logGroup: LogGroup
}

export class Airflow extends Construct {
    image: ecs.EcrImage

    constructor(parent: Construct, name: string, props: AirflowProps) {
        super(parent, name);
    
        const rds = new Rds(this, "RDS-Postgres", {
            defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
            vpc: props.vpc
        });

        let adminPassword = generateSecret(this, "AirflowAdminPasswordSecret", {
            template: { username: "admin" },
            key: "password"
        })
        let webserverSecretKey = generateSecret(this, "AirflowWebserverSecret", {
            template: {},
            key: "secret_key"
        })

        const env = {
            AWS_DEFAULT_REGION: Aws.REGION,
            AWS_LOG_GROUP: props.logGroup.logGroupName,
            AWS_LOG_STREAM_PREFIX_SWEEP: LOG_STREAM_PREFIX_SWEEP,
            AIRFLOW__CORE__SQL_ALCHEMY_CONN: rds.dbConnection,
            AIRFLOW__CELERY__BROKER_URL: "sqs://",
            AIRFLOW__CELERY__RESULT_BACKEND: "db+" + rds.dbConnection,
            AIRFLOW__CORE__EXECUTOR: "CeleryExecutor",
            AIRFLOW__WEBSERVER__SECRET_KEY: webserverSecretKey,
            ADMIN_PASS: adminPassword,
            CLUSTER: props.cluster.clusterName,
            EFS_FILE_SYSTEM_ID: props.volumeInfo.fileSystem.fileSystemId,
            LOG_STREAM_PREFIX_SWEEP: LOG_STREAM_PREFIX_SWEEP,
            MOUNT_POINT: config.EFS_MOUNT_POINT,
            SECURITY_GROUP: props.defaultVpcSecurityGroup.securityGroupId,
            SUBNET_IDS: props.subnets.map(subnet => subnet.subnetId).join(","),
            SWEEP_AGENTS_CLUSTER: props.sweepTask.cluster.clusterName,
            SWEEP_AGENTS_CAPACITY_PROVIDER: props.sweepTask.capacityProvider.capacityProviderName,
            SWEEP_CONTAINER_NAME: props.sweepTask.containerName,
            SWEEP_TASK_DEFINITION_ARN: props.sweepTask.task.taskDefinitionArn,
            WANDB_API_KEY: SecretValue.secretsManager(
                "WandbApiTokenSecret", { jsonField: "WandbApiKey" }
            ).toString()
        };

        const airflowTask = new FargateTaskDefinition(this, 'AirflowTask', {
            cpu: config.airflow.cpu,
            memoryLimitMiB: config.airflow.memoryLimitMiB,
            volumes: [{
                name: props.volumeInfo.volumeName,
                efsVolumeConfiguration: {
                    fileSystemId: props.volumeInfo.fileSystem.fileSystemId
                }
            }]
        });

        let airflowImageRepo = ecr.Repository.fromRepositoryAttributes(
            this, "AirflowImageRepository", {
                repositoryArn: Fn.importValue(
                    Fn.join("-", [
                        Aws.STACK_NAME,
                        "images",
                        "AirflowImageRepositoryArn"
                    ])
                ),
                repositoryName: Fn.join(
                    "-", [Aws.STACK_NAME, "images", "airflow"]
                )
            }
        )
        this.image = ecs.ContainerImage.fromEcrRepository(
            airflowImageRepo, "latest"
        )

        let workerTask = airflowTask; // TODO: simplify
        new Map()
            .set("webserver", airflowTask)
            .set("scheduler", airflowTask)
            .set("worker", workerTask)
            .forEach((task: ecs.FargateTaskDefinition, taskName: string) => {
                let cConfig = config.airflow[taskName] as ContainerConfig
                let container = task.addContainer(cConfig.name, {
                    image: this.image,
                    logging: new ecs.AwsLogDriver({
                        streamPrefix: `airflow-${taskName}`,
                        logGroup: props.logGroup
                    }),
                    environment: env,
                    entryPoint: [cConfig.entryPoint],
                    cpu: cConfig.cpu,
                    memoryLimitMiB: cConfig.cpu
                })
                container.addMountPoints({
                    containerPath: props.volumeInfo.containerPath,
                    sourceVolume: props.volumeInfo.volumeName,
                    readOnly: false
                })
                container.addPortMappings({ containerPort: cConfig.containerPort });
                if (taskName === "worker") {
                    container.addPortMappings({ containerPort: 8793 })
                }
                container.addToExecutionPolicy(new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["elasticfilesystem:ClientMount"],
                    resources: [props.volumeInfo.fileSystem.fileSystemArn]
                }))
            })

        let service = new Service(this, "AirflowService", {
            cluster: props.cluster,
            defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
            vpc: props.vpc,
            taskDefinition: airflowTask,
            attachLoadBalancer: true,
            rds: rds
        });
        props.volumeInfo.fileSystem.connections.allowDefaultPortFrom(
            service.fargateService
        )
    }

    private imageCi() {
        interface SweepTaskImageProps {
            dockerRepo: ecr.IRepository
            serviceRole: IRole
        }
        
        export class SweepTaskImage extends Construct {
        
            constructor(scope: Construct, id: string, props: SweepTaskImageProps) {
                super(scope, id)
        
                let gitHubSource = aws_codebuild.Source.gitHub({
                    owner: "dag-org",
                    repo: "unet",
                    webhook: true,
                    webhookFilters: [
                        aws_codebuild.FilterGroup
                            .inEventOf(aws_codebuild.EventAction.PUSH)
                            .andCommitMessageIsNot("^.*skip\\-build.*$")
                    ]
                })
        
                let ecrRegistry = Fn.sub("${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com")
                let dockerRepoName = props.dockerRepo.repositoryName.toString()
        
                let tagCommitEcrBase = "${ecrRegistry}/${dockerRepoName}"
                let tagLatest = "${dockerRepoName}:latest"
                let tagLatestEcr = `\${ecrRegistry}/${tagLatest}`
                let environmentVariables = {
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
                          pre_build: {
                            commands : [
                                "aws ecr get-login-password --region ${AWS_REGION} | "
                                + "docker login --username AWS --password-stdin "
                                + "${ECR_REGISTRY}"
                            ]
                          },
                          build: {
                            commands: [
                                "docker build "
                                + "-f exp/Dockerfile "
                                + "-t ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} "
                                + "."
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
    }
}
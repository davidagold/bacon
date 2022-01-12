import { CfnOutput } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";

import { Fn, Aws } from "aws-cdk-lib";
import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import ecr = require("aws-cdk-lib/aws-ecr");
import efs = require("aws-cdk-lib/aws-efs");
import { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { config, ContainerConfig } from "../../src/config";
import { Service } from "./service";
import { Rds } from "./rds"
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

import { SweepTask } from "./sweep-task";

export interface AirflowProps {
  readonly vpc: IVpc;
  readonly cluster: ecs.ICluster;
  readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
  readonly subnets: ec2.ISubnet[];
  readonly fileSystem: efs.FileSystem
  readonly sweepTask: SweepTask
}

export class Airflow extends Construct {
    image: ecs.EcrImage

    constructor(parent: Construct, name: string, props: AirflowProps) {
        super(parent, name);
        
        let volumeInfo = {
            containerPath: config.EFS_MOUNT_POINT,
            volumeName: "SharedVolume",
            efsVolumeConfiguration: {
                fileSystemId: props.fileSystem.fileSystemId,
            }
        }

        const rds = new Rds(this, "RDS-Postgres", {
            defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
            vpc: props.vpc
        });
        
        const adminPasswordSecret = new Secret(
            this, "AirflowAdminPasswordSecret", {
                secretName: Fn.join(
                    "-", [Aws.STACK_NAME, "AirflowAdminPasswordSecret"]
                ),
                generateSecretString: {
                    secretStringTemplate: JSON.stringify({
                        username: "admin"
                    }),
                    generateStringKey: "password",
                    excludeUppercase: false,
                    requireEachIncludedType: false,
                    includeSpace: false,
                    excludePunctuation: true,
                    excludeLowercase: false,
                    excludeNumbers: false,
                    passwordLength: 16
                }
            }
        )
        let adminPassword = adminPasswordSecret
            .secretValueFromJson("password")
            .toString()

        const env = {
            AWS_REGION: Aws.REGION,
            AIRFLOW__CORE__DAGS_FOLDER: config.airflow.dagsFolder,
            AIRFLOW__CORE__SQL_ALCHEMY_CONN: rds.dbConnection,
            AIRFLOW__CELERY__BROKER_URL: "sqs://",
            AIRFLOW__CELERY__RESULT_BACKEND: "db+" + rds.dbConnection,
            AIRFLOW__CORE__EXECUTOR: "CeleryExecutor",
            AIRFLOW__WEBSERVER__RBAC: "True",
            ADMIN_PASS: adminPassword,
            CLUSTER: props.cluster.clusterName,
            EFS_FILE_SYSTEM_ID: props.fileSystem.fileSystemId,
            MOUNT_POINT: config.EFS_MOUNT_POINT,
            SECURITY_GROUP: props.defaultVpcSecurityGroup.securityGroupId,
            SUBNET_IDS: props.subnets.map(subnet => subnet.subnetId).join(","),
            SWEEP_AGENTS_CLUSTER: props.sweepTask.cluster.clusterName,
            SWEEP_AGENTS_CAPACITY_PROVIDER: props.sweepTask.capacityProvider.capacityProviderName
        };

        const logging = new ecs.AwsLogDriver({
            streamPrefix: 'BaconLogging',
            logRetention: config.airflow.logRetention
        });

        const airflowTask = new FargateTaskDefinition(this, 'AirflowTask', {
            cpu: config.airflow.cpu,
            memoryLimitMiB: config.airflow.memoryLimitMiB,
            volumes: [{
                name: volumeInfo.volumeName,
                efsVolumeConfiguration: volumeInfo.efsVolumeConfiguration
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
                    logging: logging,
                    environment: env,
                    entryPoint: [cConfig.entryPoint],
                    cpu: cConfig.cpu,
                    memoryLimitMiB: cConfig.cpu
                })
                container.addMountPoints({
                    containerPath: volumeInfo.containerPath,
                    sourceVolume: volumeInfo.volumeName,
                    readOnly: false
                })
                container.addPortMappings({
                    containerPort: cConfig.containerPort
                });
                container.addToExecutionPolicy(new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["elasticfilesystem:ClientMount"],
                    resources: [props.fileSystem.fileSystemArn]
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
        props.fileSystem.connections.allowDefaultPortFrom(service.fargateService)

        if (config.airflow.createWorkerPool) {
            new Service(this, "WorkerService", {
                cluster: props.cluster,
                defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
                vpc: props.vpc,
                taskDefinition: workerTask,
                attachLoadBalancer: false,
                rds: rds
            });
        }
    }
}
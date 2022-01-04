import { CfnOutput } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc } from "aws-cdk-lib/aws-ec2";

import { Fn, Aws } from "aws-cdk-lib";
import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import ecr = require("aws-cdk-lib/aws-ecr");
import efs = require("aws-cdk-lib/aws-efs");
import { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { config, ContainerConfig } from "../config";
import { Service } from "./service";
import { Rds } from "./rds"
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { sub } from "@mapbox/cloudfriend/lib/intrinsic";


export interface AirflowProps {
  readonly vpc: IVpc;
  readonly cluster: ecs.ICluster;
  readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
  readonly subnets: ec2.ISubnet[];
}

export class Airflow extends Construct {

    constructor(parent: Construct, name: string, props: AirflowProps) {
        super(parent, name);
        
        let sharedFS = new efs.FileSystem(this, "AirflowEfsVolume", {
            vpc: props.vpc,
            securityGroup: props.defaultVpcSecurityGroup
        })
        sharedFS.connections.allowDefaultPortInternally()
        let volumeInfo = {
            containerPath: "/mount/efs",
            volumeName: "SharedVolume",
            efsVolumeConfiguration: {
                fileSystemId: sharedFS.fileSystemId,
            }
        }
        let mountTargets = props.vpc.privateSubnets.map((subnet) => {
            new efs.CfnMountTarget(this, "EfsMountTarget", {
                fileSystemId: sharedFS.fileSystemId,
                securityGroups: [props.defaultVpcSecurityGroup.securityGroupId],
                subnetId: subnet.subnetId
            })
        })
        new CfnOutput(this, "EfsFileSystemId", {
            value: sharedFS.fileSystemId,
            exportName: Fn.join("-", [Aws.STACK_NAME, "EfsFileSystemId"])
        })

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
            AIRFLOW__CORE__SQL_ALCHEMY_CONN: rds.dbConnection,
            AIRFLOW__CELERY__BROKER_URL: "sqs://",
            AIRFLOW__CELERY__RESULT_BACKEND: "db+" + rds.dbConnection,
            AIRFLOW__CORE__EXECUTOR: "CeleryExecutor",
            AIRFLOW__WEBSERVER__RBAC: "True",
            ADMIN_PASS: adminPassword,
            CLUSTER: props.cluster.clusterName,
            EFS_FILE_SYSTEM_ID: sharedFS.fileSystemId,
            SECURITY_GROUP: props.defaultVpcSecurityGroup.securityGroupId,
            SUBNETS: props.subnets.map(subnet => subnet.subnetId).join(",")
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

        let workerTask = airflowTask;
        // if (config.airflow.createWorkerPool) {
        //     workerTask = new FargateTaskDefinition(this, 'WorkerTask', {
        //         cpu: config.airflow.cpu,
        //         memoryLimitMiB: config.airflow.memoryLimitMiB
        //     });
        // }

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
        let airflowImage = ecs.ContainerImage.fromEcrRepository(
            airflowImageRepo, "latest"
        )

        new Map()
            .set("webserver", airflowTask)
            .set("scheduler", airflowTask)
            .set("worker", workerTask)
            .forEach((task: ecs.FargateTaskDefinition, taskName: string) => {
                let cConfig = config.airflow[taskName] as ContainerConfig
                let container = task.addContainer(cConfig.name, {
                    image: airflowImage,
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
            })

        new Service(this, "AirflowService", {
            cluster: props.cluster,
            defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
            vpc: props.vpc,
            taskDefinition: airflowTask,
            attachLoadBalancer: true,
            rds: rds
        });

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
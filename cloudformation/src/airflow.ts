import { CfnOutput } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc } from "aws-cdk-lib/aws-ec2";

import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { config, ContainerConfig } from "../config";
import { Service } from "./service";
import { Rds } from "./rds"
import { v4 as uuidv4 } from 'uuid';


export interface AirflowProps {
  readonly vpc: IVpc;
  readonly cluster: ecs.ICluster;
  readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
  readonly privateSubnets: ec2.ISubnet[];
}

export class Airflow extends Construct {
    public readonly adminPasswordOutput?: CfnOutput;

    constructor(parent: Construct, name: string, props: AirflowProps) {
        super(parent, name);
        
        const rds = new Rds(this, "RDS-Postgres", {
			defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
			vpc: props.vpc
		});
        const adminPassword = uuidv4();
        const env = {
            AIRFLOW__CORE__SQL_ALCHEMY_CONN: rds.dbConnection,
            AIRFLOW__CELERY__BROKER_URL: "sqs://",
            AIRFLOW__CELERY__RESULT_BACKEND: "db+" + rds.dbConnection,
            AIRFLOW__CORE__EXECUTOR: "CeleryExecutor",
            AIRFLOW__WEBSERVER__RBAC: "True",
            ADMIN_PASS: adminPassword,
            CLUSTER: props.cluster.clusterName,
            SECURITY_GROUP: props.defaultVpcSecurityGroup.securityGroupId,
            SUBNETS: props.privateSubnets.map(subnet => subnet.subnetId).join(",")
        };

        const logging = new ecs.AwsLogDriver({
            streamPrefix: 'FarFlowLogging',
            logRetention: config.airflow.logRetention
        });

        // Build Airflow docker image from Dockerfile
        const airflowImageAsset = new DockerImageAsset(this, 'AirflowBuildImage', {
            directory : './airflow',
        });

        const airflowTask = new FargateTaskDefinition(this, 'AirflowTask', {
            cpu: config.airflow.cpu,
            memoryLimitMiB: config.airflow.memoryLimitMiB
        });

        let workerTask = airflowTask;
        if (config.airflow.createWorkerPool) {
            workerTask = new FargateTaskDefinition(this, 'WorkerTask', {
                cpu: config.airflow.cpu,
                memoryLimitMiB: config.airflow.memoryLimitMiB
            });
        }

        let taskMap = new Map()
            .set("webserver", airflowTask)
            .set("scheduler", airflowTask)
            .set("worker", workerTask);

        for (let [taskName, task] of taskMap.entries()) {
            let cConfig = config.airflow[taskName] as ContainerConfig
            task.addContainer(cConfig.name, {
                image: ecs.ContainerImage.fromDockerImageAsset(airflowImageAsset),
                logging: logging,
                environment: env,
                entryPoint: [cConfig.entryPoint],
                cpu: cConfig.cpu,
                memoryLimitMiB: cConfig.cpu
            }).addPortMappings({
                containerPort: cConfig.containerPort
            });
        }

        new Service(this, "AirflowService", {
            cluster: props.cluster,
            defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
            vpc: props.vpc,
            taskDefinition: airflowTask,
            isWorkerService: false
        });

        if (config.airflow.createWorkerPool) {
            new Service(this, "WorkerService", {
                cluster: props.cluster,
                defaultVpcSecurityGroup: props.defaultVpcSecurityGroup,
                vpc: props.vpc,
                taskDefinition: workerTask,
                isWorkerService: true
            });
        }

        this.adminPasswordOutput = new CfnOutput(this, 'AdminPassword', {
            value: adminPassword
        });
    }
}
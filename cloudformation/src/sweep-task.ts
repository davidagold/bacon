import { Construct } from "constructs";
import ecs = require("aws-cdk-lib/aws-ecs")
import ecr = require("aws-cdk-lib/aws-ecr")
import ec2 = require("aws-cdk-lib/aws-ec2")
import autoscaling = require("aws-cdk-lib/aws-autoscaling")

import { Airflow } from "./airflow"
import logs = require("aws-cdk-lib/aws-logs");
import { EcrImage } from "aws-cdk-lib/aws-ecs";


interface SweepTaskProps {
    vpc: ec2.Vpc
}

export class SweepTask extends Construct {
    cluster: ecs.Cluster
    task: ecs.Ec2TaskDefinition
    capacityProvider: ecs.AsgCapacityProvider

    constructor(scope: Construct, id: string, props: SweepTaskProps) {
        super(scope, id)

        let autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
            vpc: props.vpc,
            instanceType: new ec2.InstanceType('p2.8xlarge'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 0,
            maxCapacity: 1,
        });
        this.capacityProvider = new ecs.AsgCapacityProvider(
            this,
            "AsgCapacityProvider", 
            { autoScalingGroup }
        )
        this.cluster = new ecs.Cluster(this, "SweepCluster", { vpc: props.vpc })
        this.cluster.addAsgCapacityProvider(this.capacityProvider)

        this.task = new ecs.Ec2TaskDefinition(this, "SweepTask")
        this.task.addContainer("SweepContainer", {
            image: EcrImage.fromEcrRepository(
                ecr.Repository.fromRepositoryArn(
                    this, 
                    "DevcontainerRepo", 
                    "arn:aws:ecr:us-east-2:510666016636:repository/devcontainer-staging"	
                ), 
                "latest"
            ),
            cpu: 1024 * 4,
            memoryReservationMiB: 1024 * 32,
            logging: new ecs.AwsLogDriver({ 
                streamPrefix: 'SweepTaskLogging',
                logGroup: new logs.LogGroup(scope, "SweepTaskLogs", {
                    logGroupName: "FarFlowDagTaskLogs",
                    retention: logs.RetentionDays.ONE_MONTH
                })
            }),
            gpuCount: 1
        })
    }
}
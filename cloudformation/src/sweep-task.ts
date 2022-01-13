import { Construct } from "constructs";
import ecs = require("aws-cdk-lib/aws-ecs")
import ecr = require("aws-cdk-lib/aws-ecr")
import ec2 = require("aws-cdk-lib/aws-ec2")
import efs = require("aws-cdk-lib/aws-efs")
import autoscaling = require("aws-cdk-lib/aws-autoscaling")

import { Airflow } from "./airflow"
import logs = require("aws-cdk-lib/aws-logs");
import { EcrImage, NetworkMode } from "aws-cdk-lib/aws-ecs";
import { SWEEP_DIR } from "../../src/experiments/sweep"
import { Aws, Fn } from "aws-cdk-lib";

import { LOG_STREAM_PREFIX_SWEEP } from "../../exp/sweep/config.json"
import { EfsVolumeInfo } from "../bacon.template"
import { Policies } from "../src/policies"

interface SweepTaskProps {
    vpc: ec2.Vpc
    volumeInfo: EfsVolumeInfo
    logGroup: logs.LogGroup
    defaultSecurityGroup: ec2.SecurityGroup
}

export class SweepTask extends Construct {
    cluster: ecs.Cluster
    task: ecs.Ec2TaskDefinition
    capacityProvider: ecs.AsgCapacityProvider

    constructor(scope: Construct, id: string, props: SweepTaskProps) {
        super(scope, id)

        let autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
            vpc: props.vpc,
            securityGroup: props.defaultSecurityGroup,
            // instanceType: new ec2.InstanceType('p2.8xlarge'),
            instanceType: new ec2.InstanceType('c5.9xlarge'),
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

        this.task = new ecs.Ec2TaskDefinition(this, "SweepTask", {
            networkMode: NetworkMode.AWS_VPC
        })
        new Policies(this, "SweepTaskPolicies").addToRole(this.task.executionRole)
        this.task.addVolume({   // TODO: Factor into Task Construct
            name: props.volumeInfo.volumeName, 
            efsVolumeConfiguration: { 
                fileSystemId: props.volumeInfo.fileSystem.fileSystemId
            }
        })

        this.task.addContainer("SweepContainer", {
            image: EcrImage.fromEcrRepository(
                ecr.Repository.fromRepositoryAttributes(
                    this, 
                    "SweepTaskDockerRepo", 
                    {
                        repositoryName: Fn.join("-", [Aws.STACK_NAME, "images", "sweep"]),
                        repositoryArn:  Fn.importValue(Fn.join("-", [
                            Aws.STACK_NAME,
                            "images",
                            "SweepTaskDkrRepositoryArn"
                        ]))
                    }
                ), 
                "latest"
            ),
            cpu: 1024 * 4,
            // memoryReservationMiB: 1024 * 32,
            memoryReservationMiB: 1024 * 8,
            logging: new ecs.AwsLogDriver({ 
                streamPrefix: LOG_STREAM_PREFIX_SWEEP, logGroup: props.logGroup
            }),
            // gpuCount: 1
            environment: {
                EFS_FILE_SYSTEM_ID: props.volumeInfo.fileSystem.fileSystemId,
            }
        })
            .addMountPoints({  // TODO: Factor into task construct
                containerPath: props.volumeInfo.containerPath,
                sourceVolume: props.volumeInfo.volumeName,
                readOnly: false
            })
    }
}

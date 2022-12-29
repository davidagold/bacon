import { Construct } from "constructs";
import ecs = require("aws-cdk-lib/aws-ecs")
import ecr = require("aws-cdk-lib/aws-ecr")
import ec2 = require("aws-cdk-lib/aws-ec2")
import efs = require("aws-cdk-lib/aws-efs")
import iam = require("aws-cdk-lib/aws-iam")
import autoscaling = require("aws-cdk-lib/aws-autoscaling")

import { Airflow } from "./airflow"
import logs = require("aws-cdk-lib/aws-logs");
import { EcrImage, NetworkMode } from "aws-cdk-lib/aws-ecs";
import { SWEEP_DIR } from "../../src/experiments/sweep"
import { Aws, Fn, SecretValue } from "aws-cdk-lib";

import { LOG_STREAM_PREFIX_SWEEP } from "../../src/exp/sweep/config.json"
import { EfsVolumeInfo } from "../bacon"
import { Policies } from "../src/policies"


const INSTANCE_TYPES = new Map()
    .set("c5.9xlarge", { vcpu: 32, gbMemory: 72 })
    .set("p3.8xlarge", { vcpu: 32, gbMemory: 244, gpus: 4 })
const DEFAULT_INSTANCE_TYPE = "c5.9xlarge"

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
    containerName: string

    constructor(scope: Construct, id: string, props: SweepTaskProps) {
        super(scope, id)

        let instanceType = this.node.tryGetContext("sweepTaskInstanceType") ?? DEFAULT_INSTANCE_TYPE
        if ([...INSTANCE_TYPES.keys()].findIndex(t => t === instanceType) < 0) {
            throw new Error(`context.sweepTaskInstanceType must be from ${[...INSTANCE_TYPES.keys()]}`)
        }
        let numSweepTasks = this.node.tryGetContext("numSweepTasks")

        let autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
            vpc: props.vpc,
            securityGroup: props.defaultSecurityGroup,
            instanceType: new ec2.InstanceType(instanceType),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 0,
            maxCapacity: this.node.tryGetContext("maxNumInstances"),
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
            keyName: this.node.tryGetContext("sweepTaskAsgKeyName")
        });
        this.capacityProvider = new ecs.AsgCapacityProvider(
            this,
            "AsgCapacityProvider", 
            { autoScalingGroup }
        )
        autoScalingGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(22))

        this.cluster = new ecs.Cluster(this, "SweepCluster", { vpc: props.vpc })
        this.cluster.addAsgCapacityProvider(this.capacityProvider)

        this.task = new ecs.Ec2TaskDefinition(this, "SweepTask", {
            networkMode: NetworkMode.AWS_VPC,
        })
        let policies = new Policies(this, "SweepTaskPolicies")
        policies.addToRole(this.task.taskRole)
        this.task.addVolume({   // TODO: Factor into Task Construct
            name: props.volumeInfo.volumeName,
            efsVolumeConfiguration: { 
                fileSystemId: props.volumeInfo.fileSystem.fileSystemId
            }
        })

        this.containerName = "SweepContainer"
        let container = this.task.addContainer(this.containerName, {
            image: EcrImage.fromEcrRepository(
                ecr.Repository.fromRepositoryAttributes(
                    this, 
                    "SweepTaskDockerRepo", 
                    {
                        repositoryName: Fn.join("-", ["unet", "images", "staging", "sweep"]), // TODO: Parametrize
                        repositoryArn:  Fn.importValue(Fn.join("-", [
                            "unet", "images", "staging", "SweepTaskDkrRepositoryArn"
                        ]))
                    }
                ), 
                this.node.tryGetContext("sweepTaskImageTag")
            ),
            cpu: Math.trunc(1024 * (INSTANCE_TYPES.get(instanceType).vcpu / numSweepTasks - 0.5)),
            memoryReservationMiB: Math.trunc(1024 * (INSTANCE_TYPES.get(instanceType).gbMemory / numSweepTasks - 0.5)),
            logging: new ecs.AwsLogDriver({ 
                streamPrefix: LOG_STREAM_PREFIX_SWEEP, logGroup: props.logGroup
            }),
            gpuCount: this.node.tryGetContext("sweepTaskInstanceType") === "p3.8xlarge" ? 1 : 0,
            environment: {
                AWS_REGION: Aws.REGION,
                EFS_FILE_SYSTEM_ID: props.volumeInfo.fileSystem.fileSystemId,
                WANDB_API_KEY: SecretValue.secretsManager(
                    "WandbApiTokenSecret", { jsonField: "WandbApiKey" }
                ).toString()
            }
        })
        container.addMountPoints({  // TODO: Factor into task construct
            containerPath: props.volumeInfo.containerPath,
            sourceVolume: props.volumeInfo.volumeName,
            readOnly: false
        })
        container.addToExecutionPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:DescribeMountTargets"
            ],
            resources: [
                props.volumeInfo.fileSystem.fileSystemArn
            ]
        }))
    }
}

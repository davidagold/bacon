import { Construct } from "constructs";
import ecs = require("aws-cdk-lib/aws-ecs")
import ec2 = require("aws-cdk-lib/aws-ec2")

import { config, ContainerConfig } from "../../src/config";
import { EfsVolumeInfo } from "../bacon.template"
import { Policies } from "../src/policies"


interface TaskProps {
    name: string,
    definitionType: "FARGATE" | "EC2"
    volumeInfo: EfsVolumeInfo
}

export class Task extends Construct {
    def: ecs.Ec2TaskDefinition | ecs.FargateTaskDefinition

    constructor(scope: Construct, id: string, props: TaskProps) {
        super(scope, id)

        let fargateOptions = {
            cpu: config.airflow.cpu,
            memoryLimitMiB: config.airflow.memoryLimitMiB
        }

        let TaskDefinition = props.definitionType === "EC2"
            ? ecs.Ec2TaskDefinition
            : ecs.FargateTaskDefinition

        this.def = new TaskDefinition(this, `${props.name}Task`, Object.assign({
            networkMode: ecs.NetworkMode.AWS_VPC,
            volumes: [{
                name: props.volumeInfo.volumeName,
                efsVolumeConfiguration: {
                    fileSystemId: props.volumeInfo.fileSystem.fileSystemId
                }
            }]
        }, props.definitionType === "FARGATE" ? fargateOptions : {}))
        
        let policies = new Policies(this, "SweepTaskPolicies")
        policies.addToRole(this.def.taskRole)
    }
}
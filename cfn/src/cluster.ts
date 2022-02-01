import { CfnOutput, Duration, Fn, Aws } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import autoscaling = require("aws-cdk-lib/aws-autoscaling")

import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");


export interface ClusterProps {
    vpc: Vpc
    securityGroup: ec2.SecurityGroup,
    instanceType?: ec2.InstanceType
    minCapacity?: number
    maxCapacity?: number
}

export class Cluster extends Construct {
    cluster: ecs.Cluster

    constructor(scope: Construct, id: string, props: ClusterProps) {
        super(scope, id)

        this.cluster = new ecs.Cluster(this, 'EcsCluster', { vpc: props.vpc });
        if (props.instanceType) {
            let autoScalingGroup = new autoscaling.AutoScalingGroup(this, "Asg", {
                vpc: props.vpc,
                securityGroup: props.securityGroup,
                instanceType: props.instanceType,
                machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
                minCapacity: props.minCapacity || 0,
                maxCapacity: props.maxCapacity || 1,
                associatePublicIpAddress: true,
                vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
            })
            let capacityProvider = new ecs.AsgCapacityProvider(
                this,
                "AsgCapacityProvider", 
                { autoScalingGroup }
            )
            this.cluster.addAsgCapacityProvider(capacityProvider)
        }
    }
}

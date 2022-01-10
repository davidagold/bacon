import { CfnOutput, Duration, Fn, Aws } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import { FargatePlatformVersion, FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { Policies } from "./policies";
import { config } from "../../src/config";
import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");

import { Rds } from "./rds"


export interface ServiceProps {
    readonly vpc: IVpc;
    readonly cluster: ecs.ICluster;
    readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
    readonly taskDefinition: FargateTaskDefinition;
    readonly attachLoadBalancer: boolean
    readonly rds: Rds
}

function tcpPortRange(fromPort: number, toPort: number): ec2.Port {
    return new ec2.Port({
        protocol: ec2.Protocol.TCP,
        fromPort: fromPort,
        toPort: toPort,
        stringRepresentation: "All"
    })
}

export class Service extends Construct {
    readonly fargateService: ecs.FargateService;
    private readonly loadBalancer?: elbv2.ApplicationLoadBalancer

    constructor(parent: Construct, id: string, props: ServiceProps) {
        super(parent, id);

        let policies = new Policies(this, "AIrflowTaskPolicies");
        if (policies.managedPolicies) {
            policies.managedPolicies.forEach((managedPolicy) => 
                props.taskDefinition.taskRole.addManagedPolicy(managedPolicy)
            );
        }
        if (policies.policyStatements) {
            policies.policyStatements.forEach((policyStatement) => 
                props.taskDefinition.taskRole.addToPrincipalPolicy(policyStatement)
            );
        }

        this.fargateService = new ecs.FargateService(this, id, {
            cluster: props.cluster,
            assignPublicIp: true,  // Required to pull from ECR
            taskDefinition: props.taskDefinition,
            securityGroups: [props.defaultVpcSecurityGroup],
            enableExecuteCommand: true,
            platformVersion: FargatePlatformVersion.VERSION1_4,
            vpcSubnets: props.vpc.selectSubnets({ 
                subnetType: ec2.SubnetType.PUBLIC
            })
        });

        props.rds.rdsInstance.connections
            .allowFrom(this.fargateService, tcpPortRange(5432, 5432))
        
        if (props.attachLoadBalancer) {
            let allowedPorts = tcpPortRange(0, 65535)
            let albSecurityGroup = new ec2.SecurityGroup(
                this, "AlbSecurityGroup", { vpc: props.vpc }
            )
            albSecurityGroup.connections.allowFromAnyIpv4(allowedPorts)
            this.loadBalancer = new elbv2.ApplicationLoadBalancer(
                this, "ApplicationLoadBalancer", {
                    vpc: props.vpc,
                    internetFacing: true,
                    securityGroup: albSecurityGroup
                }
            );
            this.loadBalancer
                .addListener("Listener", { port: 80 })
                .addTargets("AirflowFargateServiceTargetGroup", {
                    healthCheck: {
                        port: "traffic-port",
                        protocol: elbv2.Protocol.HTTP,
                        path: "/health"
                    },
                    port: 80,
                    targets: [this.fargateService]
                })
                .setAttribute("deregistration_delay.timeout_seconds", "60");
            
            this.fargateService.connections
                .allowFrom(this.loadBalancer, allowedPorts)

            new CfnOutput(this, 'LoadBalancerDNSName', { 
                value: this.loadBalancer.loadBalancerDnsName,
                exportName: Fn.join("-", [Aws.STACK_NAME, "AlbDnsName"])
            });
        }
    }

    private configureAutoScaling(): void {
        let scaling = this.fargateService.autoScaleTaskCount({
            maxCapacity: config.workerAutoScaling.maxTaskCount,
            minCapacity: config.workerAutoScaling.minTaskCount
        });

        if (config.workerAutoScaling.cpuUsagePercent) {
            scaling.scaleOnCpuUtilization("CpuScaling", {
                targetUtilizationPercent: config.workerAutoScaling.cpuUsagePercent,
                scaleInCooldown: Duration.seconds(60),
                scaleOutCooldown: Duration.seconds(60)
            });
        }

        if (config.workerAutoScaling.memUsagePercent) {
            scaling.scaleOnMemoryUtilization("MemoryScaling", {
                targetUtilizationPercent: config.workerAutoScaling.memUsagePercent,
                scaleInCooldown: Duration.seconds(60),
                scaleOutCooldown: Duration.seconds(60)
            });
        }
    }
}
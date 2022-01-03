import { CfnOutput, Duration } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { FargatePlatformVersion, FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';

import { Policies } from "./policies";
import { config } from "../config";
import ecs = require('aws-cdk-lib/aws-ecs');
import ec2 = require("aws-cdk-lib/aws-ec2");
import elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");


export interface ServiceOptions {
    readonly vpc: IVpc;
    readonly cluster: ecs.ICluster;
    readonly defaultVpcSecurityGroup: ec2.ISecurityGroup;
    readonly taskDefinition: FargateTaskDefinition;
    readonly isWorkerService?: boolean;
}

export class Service extends Construct {
    private readonly fargateService: ecs.FargateService;
    public readonly loadBalancerDnsName?: CfnOutput;

    constructor(parent: Construct, id: string, options: ServiceOptions) {
        super(parent, id);

        let policies = new Policies(this, "AIrflowTaskPolicies");
        if (policies.managedPolicies) {
            policies.managedPolicies.forEach((managedPolicy) => 
                options.taskDefinition.taskRole.addManagedPolicy(managedPolicy)
            );
        }
        if (policies.policyStatements) {
            policies.policyStatements.forEach((policyStatement) => 
                options.taskDefinition.taskRole.addToPrincipalPolicy(policyStatement)
            );
        }

        this.fargateService = new ecs.FargateService(this, id, {
            cluster: options.cluster,
            taskDefinition: options.taskDefinition,
            securityGroups: [options.defaultVpcSecurityGroup],
            enableExecuteCommand: true,
            platformVersion: FargatePlatformVersion.VERSION1_4
        });
        const allowedPorts = new ec2.Port({
            protocol: ec2.Protocol.TCP,
            fromPort: 0,
            toPort: 65535,
            stringRepresentation: "All"
        });
        this.fargateService.connections.allowFromAnyIpv4(allowedPorts);

        if (options.isWorkerService) {
            this.configureAutoScaling();
        }
        else {
            // Load Balancer DNS Name will be used to access Airflow UI
            this.loadBalancerDnsName = new CfnOutput(this, 'LoadBalancerDNSName', 
                { value: this.attachLoadBalancer(options.vpc) }
            );
        }
    }

    private attachLoadBalancer(vpc: IVpc): string {
        let loadBalancer = new elbv2.NetworkLoadBalancer(this, "NetworkLoadBalancer", {
            vpc: vpc,
            internetFacing: true,
            crossZoneEnabled: true
        });

        const listener = loadBalancer
            .addListener("Listener", { port: 80 });

        const targetGroup = listener.addTargets(
            "AirflowFargateServiceTargetGroup",
            {
                healthCheck: {
                    port: "traffic-port",
                    protocol: elbv2.Protocol.HTTP,
                    path: "/health"
                },
                port: 80,
                targets: [this.fargateService]
            }
        );
        targetGroup.setAttribute("deregistration_delay.timeout_seconds", "60");

        return loadBalancer.loadBalancerDnsName;
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
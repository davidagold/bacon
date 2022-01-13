// Drawing from https://github.com/PracticeVelocity/Airflow-on-Fargate
import { Template } from "aws-cdk-lib/assertions";
import ec2 = require('aws-cdk-lib/aws-ec2');
import ecs = require('aws-cdk-lib/aws-ecs');
import efs = require("aws-cdk-lib/aws-efs")
import cdk = require('aws-cdk-lib');
import logs = require("aws-cdk-lib/aws-logs")
import { Aws, Fn, CfnOutput } from 'aws-cdk-lib';
import { Airflow } from "./src/airflow";
import { Registrar } from "./src/registrar"
import { SweepTask } from "./src/sweep-task"
import { config } from "../src/config"


class Bacon extends cdk.Stack {
    
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        cdk.Tags.of(scope).add("Stack", cdk.Aws.STACK_NAME);

        let vpc = new ec2.Vpc(this, 'Vpc', { 
            maxAzs: 2, natGateways: 0
        });
        let defaultVpcSecurityGroup = new ec2.SecurityGroup(
            this, "SecurityGroup", { vpc: vpc }
        );
        
        let efsSecurityGroup = new ec2.SecurityGroup(
            this, "EfsSecurityGroup", { vpc: vpc }
        )
        let fileSystem = new efs.FileSystem(this, "AirflowEfsVolume", {
            vpc: vpc,
            securityGroup: efsSecurityGroup
        })
        vpc.privateSubnets.forEach((subnet) => {
            new efs.CfnMountTarget(this, "EfsMountTarget", {
                fileSystemId: fileSystem.fileSystemId,
                securityGroups: [efsSecurityGroup.securityGroupId],
                subnetId: subnet.subnetId
            })
        })
        new CfnOutput(this, "EfsFileSystemId", {
            value: fileSystem.fileSystemId,
            exportName: Fn.join("-", [Aws.STACK_NAME, "EfsFileSystemId"])
        })
        
        new Registrar(this, "Registrar", { fileSystem: fileSystem, vpc: vpc })

        let logGroup = new logs.LogGroup(scope, "SweepTaskLogs", {
            logGroupName: "SweepTaskLogs",
            retention: logs.RetentionDays.ONE_MONTH
        })

        let cluster = new ecs.Cluster(this, 'ECSCluster', { vpc: vpc });
        new Airflow(this, "AirflowService", {
            cluster: cluster,
            vpc: vpc,
            defaultVpcSecurityGroup: defaultVpcSecurityGroup,
            subnets: vpc.publicSubnets,
            fileSystem: fileSystem,
            logGroup: logGroup,
            sweepTask: new SweepTask(this, "SweepTask", { 
                vpc, fileSystem, logGroup
            })
        });
    }
}


module.exports = Template
    .fromStack(new Bacon(new cdk.App(), 'Bacon'))
    .toJSON()

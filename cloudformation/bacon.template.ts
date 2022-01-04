// Drawing from https://github.com/PracticeVelocity/Airflow-on-Fargate
import { Template } from "aws-cdk-lib/assertions";
import ec2 = require('aws-cdk-lib/aws-ec2');
import ecs = require('aws-cdk-lib/aws-ecs');
import cdk = require('aws-cdk-lib');
import { Airflow } from "./src/airflow";
import { SubnetType } from "aws-cdk-lib/aws-ec2";


class Bacon extends cdk.Stack {
    
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        cdk.Tags.of(scope).add("Stack", cdk.Aws.STACK_NAME);

        let vpc = new ec2.Vpc(this, 'Vpc', { 
            maxAzs: 2, natGateways: 0
        });
        let cluster = new ecs.Cluster(this, 'ECSCluster', { vpc: vpc });
        let defaultVpcSecurityGroup = new ec2.SecurityGroup(
            this, "SecurityGroup", { vpc: vpc }
        );
    
        // new 
        new Airflow(this, "AirflowService", {
            cluster: cluster,
            vpc: vpc,
            defaultVpcSecurityGroup: defaultVpcSecurityGroup,
            subnets: vpc.publicSubnets
        });
    }
}


module.exports = Template
    .fromStack(new Bacon(new cdk.App(), 'Bacon'))
    .toJSON()

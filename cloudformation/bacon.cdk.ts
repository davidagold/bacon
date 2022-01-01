// Drawing from https://github.com/PracticeVelocity/Airflow-on-Fargate
import ec2 = require('aws-cdk-lib/aws-ec2');
import ecs = require('aws-cdk-lib/aws-ecs');
import cdk = require('aws-cdk-lib/core');
import { Rds } from "./src/rds";
import { Airflow } from "./src/airflow";


class Bacon extends cdk.Stack {
	
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		let vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });
		cdk.Tags.of(scope).add("Stack", cdk.Aws.STACK_NAME);

		let cluster = new ecs.Cluster(this, 'ECSCluster', { vpc: vpc });
		let defaultVpcSecurityGroup = new ec2.SecurityGroup(this, 
			"SecurityGroup", { vpc: vpc }
		);
	
		// TODO: Move following to Airflow?
		const rds = new Rds(this, "RDS-Postgres", {
			defaultVpcSecurityGroup: defaultVpcSecurityGroup,
			vpc: vpc
		});
	
		new Airflow(this, "AirflowService", {
			cluster: cluster,
			vpc: vpc,
			dbConnection: rds.dbConnection,
			defaultVpcSecurityGroup: defaultVpcSecurityGroup,
			privateSubnets: vpc.privateSubnets
		});
	
		// // Create TaskDefinitions for on-demand Fargate tasks, invoked from DAG
		// new DagTasks(this, "DagTasks", {
		// 	vpc: vpc,
		// 	defaultVpcSecurityGroup: defaultVpcSecurityGroup
		// });
	}
}
	
const app = new cdk.App();
new Bacon(app, 'Bacon');
app.synth();
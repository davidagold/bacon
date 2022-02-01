import { Duration, Fn, Aws } from "aws-cdk-lib";
import { Construct } from 'constructs';
import {
    DatabaseInstance,
    DatabaseInstanceEngine, PostgresEngineVersion,
    StorageType
} from "aws-cdk-lib/aws-rds";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import {
    InstanceType,
    ISecurityGroup,
    IVpc,
    SubnetType
} from "aws-cdk-lib/aws-ec2";

import { config, RdsConfig } from "../../src/config";

export interface RdsProps {
    readonly vpc: IVpc;
    readonly defaultVpcSecurityGroup: ISecurityGroup;
    readonly dbConfig?: RdsConfig;
}

export class Rds extends Construct {
    public readonly dbConnection: string;
    public readonly rdsInstance: DatabaseInstance;

    constructor(parent: Construct, name: string, props: RdsProps) {
        super(parent, name);

        const backendSecret: ISecret = new Secret(this, "DatabseSecret", {
            secretName: Fn.join(
                "-", [Aws.STACK_NAME, "RdsPasswordSecret"]
            ),
            description: "airflow RDS secrets",
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: config.rds.masterUsername
                }),
                generateStringKey: "password",
                excludeUppercase: false,
                requireEachIncludedType: false,
                includeSpace: false,
                excludePunctuation: true,
                excludeLowercase: false,
                excludeNumbers: false,
                passwordLength: 16
            }
        });

    const databasePasswordSecret = backendSecret
        .secretValueFromJson("password");

    this.rdsInstance = new DatabaseInstance(this, "RDSInstance", {
        engine: DatabaseInstanceEngine.postgres({
            version: PostgresEngineVersion.VER_13_4
        }),
        instanceType: config.rds.instanceType,
        instanceIdentifier: Fn.join("-", [Aws.STACK_NAME, config.rds.dbName]),
        vpc: props.vpc,
        securityGroups: [props.defaultVpcSecurityGroup],
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_NAT },
        storageEncrypted: true,
        multiAz: false,
        autoMinorVersionUpgrade: false,
        allocatedStorage: config.rds.allocatedStorageInGB,
        storageType: StorageType.GP2,
        backupRetention: Duration.days(config.rds.backupRetentionInDays),
        deletionProtection: false,
        credentials: {
            username: config.rds.masterUsername,
            password: databasePasswordSecret
        },
        databaseName: config.rds.dbName,
        port: config.rds.port
    });

    this.dbConnection = this.getDbConnection(
        config.rds,
        this.rdsInstance.dbInstanceEndpointAddress,
        databasePasswordSecret.toString()
    );
  }

    public getDbConnection(
        config: RdsConfig, endpoint: string, password: string
    ): string {
        return `postgresql+psycopg2://${
            config.masterUsername
        }:${password}@${endpoint}:${
            config.port
        }/${config.dbName}`;
    }
}

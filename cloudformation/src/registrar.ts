import lambda = require("aws-cdk-lib/aws-lambda")
import { Aws, Fn } from "aws-cdk-lib"
import ecr = require("aws-cdk-lib/aws-ecr")
import efs = require("aws-cdk-lib/aws-efs")
import ec2 = require("aws-cdk-lib/aws-ec2")
import { Construct } from "constructs"
import { config } from "../../src/config"
import iam = require("aws-cdk-lib/aws-iam")


interface RegistrarProps {
    readonly fileSystem: efs.FileSystem
    readonly vpc: ec2.Vpc
}

export class Registrar extends Construct {
    registrarFn: lambda.Function

    constructor(scope: Construct, id: string, props: RegistrarProps) {
        super(scope, id)

        let accessPoint = new efs.AccessPoint(this, "RegistrarAccessPoint", {
            fileSystem: props.fileSystem,
            path: "/efs"
        })

        let registrarImageRepo = ecr.Repository.fromRepositoryAttributes(
            this, "registrarImageRepository", {
                repositoryArn: Fn.importValue(
                    Fn.join("-", [
                        Aws.STACK_NAME,
                        "images",
                        "RegistrarDkrRepositoryArn"
                    ])
                ),
                repositoryName: Fn.join(
                    "-", [Aws.STACK_NAME, "images", "registrar"] // TODO: import this
                )
            }
        )

        this.registrarFn = new lambda.Function(this, "RegistrarFunction", {
            code: lambda.Code.fromEcrImage(
                registrarImageRepo, { tag: "latest" }
            ),
            runtime: lambda.Runtime.FROM_IMAGE,
            handler: lambda.Handler.FROM_IMAGE,
            filesystem: lambda.FileSystem.fromEfsAccessPoint(
                accessPoint, config.airflow.efsMountPoint
            ),
            vpc: props.vpc,
            role: new iam.Role(this, "RegistrarFnServiceRole", {
                assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
                inlinePolicies: {
                    CodebuildPolicy: new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                sid: "CloudWatchLogsStatement",
                                effect: iam.Effect.ALLOW,
                                actions: [
                                    "elasticfilesystem:ClientMount",
                                    "elasticfilesystem:ClientWrite",
                                    "elasticfilesystem:DescribeMountTargets",
                                ],
                                resources: [props.fileSystem.fileSystemArn]
                            })
                        ]
                    })
                },
                managedPolicies: [
                    iam.ManagedPolicy.fromManagedPolicyArn(
                        this, 
                        "LambdaPolicy",
                        "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
                    )
                ]
            })
        })
        props.fileSystem.connections.allowDefaultPortFrom(this.registrarFn)
    }    
}

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

        let registrarDkrRepoName = `bacon-images-${this.node.tryGetContext("env")}-registrar`
        let registrarImageRepo = ecr.Repository.fromRepositoryAttributes(
            this, "registrarImageRepository", {
                repositoryArn: Fn.importValue(
                    `${registrarDkrRepoName}-DkrRepositoryArn`
                ),
                repositoryName: registrarDkrRepoName
            }
        )

        this.registrarFn = new lambda.Function(this, "RegistrarFunction", {
            code: lambda.Code.fromEcrImage(
                registrarImageRepo, { tag: "latest" }
            ),
            runtime: lambda.Runtime.FROM_IMAGE,
            handler: lambda.Handler.FROM_IMAGE,
            vpc: props.vpc,
            role: new iam.Role(this, "RegistrarFnServiceRole", {
                assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [
                    iam.ManagedPolicy.fromManagedPolicyArn(
                        this, 
                        "LambdaPolicy",
                        "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
                    )
                ]
            })
        })
    }    
}

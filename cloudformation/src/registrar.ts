import lambda = require("aws-cdk-lib/aws-lambda")
import { Aws, Fn } from "aws-cdk-lib"
import ecr = require("aws-cdk-lib/aws-ecr")
import efs = require("aws-cdk-lib/aws-efs")
import { Construct } from "constructs"
import { config } from "../../src/config"


interface RegistrarProps {
    fileSystem: efs.FileSystem
}

class Registrar extends Construct {
    registrarFn: lambda.Function

    constructor(scope: Construct, id: string, props: RegistrarProps) {
        super(scope, id)

        let accessPoint = new efs.AccessPoint(this, "RegistrarAccessPoint", {
            fileSystem: props.fileSystem,
            path: "/"
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
            )
        })
    }    
}

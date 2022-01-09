import lambda = require("aws-cdk-lib/aws-lambda")
import { Aws, Fn } from "aws-cdk-lib"
import ecr = require("aws-cdk-lib/aws-ecr")
import { Construct } from "constructs"


class Registrar extends Construct {
    registrarFn: lambda.Function

    constructor(scope: Construct, id: string, props) {
        super(scope, id)

        let registrarImageRepo = ecr.Repository.fromRepositoryAttributes(
            this, "registrarImageRepository", {
                repositoryArn: Fn.importValue(
                    Fn.join("-", [
                        Aws.STACK_NAME,
                        "images",
                        "RegistrarImageRepositoryArn"
                    ])
                ),
                repositoryName: Fn.join(
                    "-", [Aws.STACK_NAME, "images", "registrar"]
                )
            }
        )

        this.registrarFn = new lambda.Function(this, "RegistrarFunction", {
            code: lambda.Code.fromEcrImage(
                registrarImageRepo, { tag: "latest" }
            ),
            runtime: lambda.Runtime.FROM_IMAGE,
            handler: lambda.Handler.FROM_IMAGE
        })
    }    
}


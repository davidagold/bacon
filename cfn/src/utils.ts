import { Fn, Aws } from "aws-cdk-lib"
import ecr = require("aws-cdk-lib/aws-ecr");
import iam = require("aws-cdk-lib/aws-iam");
import codebuild = require("aws-cdk-lib/aws-codebuild")
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";


interface generateSecretProps {
    template: {[key:string]: string}
    key: string
}

export function generateSecret(scope: Construct, id: string, props: generateSecretProps) {
    return new Secret(scope, id, {
        secretName: Fn.join("-", [Aws.STACK_NAME, id]),
        generateSecretString: {
            secretStringTemplate: JSON.stringify(props.template),
            generateStringKey: props.key,
            excludeUppercase: false,
            requireEachIncludedType: false,
            includeSpace: false,
            excludePunctuation: true,
            excludeLowercase: false,
            excludeNumbers: false,
            passwordLength: 16
        }
    }).secretValueFromJson(props.key).toString()
}

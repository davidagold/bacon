import { config } from "../src/config"
import codebuild = require('aws-cdk-lib/aws-codebuild');
import ecr = require("aws-cdk-lib/aws-ecr");
import { Fn, Stack, App, Aws, CfnOutput } from "aws-cdk-lib"
import { Construct } from "constructs"
import { Template } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement, Effect, IRole } from "aws-cdk-lib/aws-iam";
import { statements } from "./src/statements"


interface ImageCiProps { 
    imagePrefix: string
    gitHubOwner: string, 
    gitHubRepo: string,
    codebuildServiceRole: IRole
    buildCommands: string[],
    environmentVariables?: { [name:string]: codebuild.BuildEnvironmentVariable }
}

class imageCi extends Construct {

    constructor(scope: Construct, id: string, props: ImageCiProps) {
        super(scope, id)
        
        let dockerRepo = new ecr.Repository(
            this,
            `DockerRepository-${props.imagePrefix}`, 
            { repositoryName: Fn.join("-", [Aws.STACK_NAME, props.imagePrefix])
        })
        
        new CfnOutput(this, `DkrRepositoryArn-${props.imagePrefix}`, {
            value: dockerRepo.repositoryArn,
            exportName: Fn.join("-", [Aws.STACK_NAME, props.imagePrefix, "DkrRepositoryArn"])
        })
        
        this.includeImageCi({ ...props, dockerRepo})
    }

    private includeImageCi(options: ImageCiProps & { dockerRepo: ecr.IRepository }) {
     
        let gitHubSource = codebuild.Source.gitHub({
            owner: options.gitHubOwner,
            repo: options.gitHubRepo,
            webhook: true,
            webhookFilters: [
                codebuild.FilterGroup
                    .inEventOf(codebuild.EventAction.PUSH)
                    .andCommitMessageIsNot("^.*skip\\-build.*$")
            ]
        })
    
        let ecrRegistry = Fn.sub("${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com")
        let dockerRepoName = options.dockerRepo.repositoryName.toString()
    
        let tagCommitEcrBase = "${ecrRegistry}/${dockerRepoName}"
        let tagLatest = "${dockerRepoName}:latest"
        let tagLatestEcr = `\${ecrRegistry}/${tagLatest}`
        let environmentVariables = {
            AWS_REGION: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Aws.REGION
            },
            DOCKER_REPO: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: dockerRepoName
            },
            ECR_REGISTRY: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: ecrRegistry
            },
            TAG_COMMIT_ECR_BASE: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagCommitEcrBase, { ecrRegistry, dockerRepoName })
            },
            TAG_LATEST_ECR: {
                type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                value: Fn.sub(tagLatestEcr, { dockerRepoName, ecrRegistry })
            },
            ...options.environmentVariables
        }
    
        let buildSpec = codebuild.BuildSpec.fromObjectToYaml({
            version: "0.2",
            phases: {
                pre_build: {
                    commands : [
                        "aws ecr get-login-password --region ${AWS_REGION} | "
                        + "docker login --username AWS --password-stdin "
                        + "${ECR_REGISTRY}"
                    ]
                },
                build: { commands: options.buildCommands },
                post_build: {
                    commands: [
                        "docker tag ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} ${TAG_COMMIT_ECR_BASE}:${CODEBUILD_RESOLVED_SOURCE_VERSION}",
                        "docker tag ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} ${TAG_LATEST_ECR}",
                        "docker push ${TAG_COMMIT_ECR_BASE}:${CODEBUILD_RESOLVED_SOURCE_VERSION}",
                        "docker push ${TAG_LATEST_ECR}"
                    ]
                }
            }
        })
    
        new codebuild.Project(this, `CbProject-${options.imagePrefix}`, {
            source: gitHubSource,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
                computeType: codebuild.ComputeType.SMALL,
                privileged: true,
            },
            environmentVariables: environmentVariables,
            role: options.codebuildServiceRole,
            buildSpec: buildSpec,
        })
    }
}

class Images extends Stack {

    constructor(scope: App, id: string) {
        super(scope, id)

        let serviceRole = new Role(this, "RegistrarProjectServiceRole", {
            assumedBy: new ServicePrincipal("codebuild.amazonaws.com"),
            inlinePolicies: {
                CodebuildPolicy: new PolicyDocument({ statements })
            }
        })

        new imageCi(this, "AirflowImageCi", {
            imagePrefix: "airflow",
            gitHubOwner: "dag-org",
            gitHubRepo: "bacon",
            buildCommands: [
                "docker build " +
                "-f airflow/Dockerfile " +
                "-t ${DOCKER_REPO}:${!CODEBUILD_RESOLVED_SOURCE_VERSION} " + 
                "--build-arg MOUNT_POINT=${!MOUNT_POINT} " + 
                "airflow"
            ],
            environmentVariables: {
                MOUNT_POINT: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: config.EFS_MOUNT_POINT
                }
            },
            codebuildServiceRole: serviceRole
        })

        new imageCi(this, "RegistrarImageCi", {
            imagePrefix: "registrar",
            gitHubOwner: "dag-org",
            gitHubRepo: "bacon",
            buildCommands: [
                "docker build "
                + "-t ${DOCKER_REPO}:${CODEBUILD_RESOLVED_SOURCE_VERSION} "
                + "."
            ],
            codebuildServiceRole: serviceRole
        })
    }
}


const app = new App();
new Images(app, `bacon-images-${app.node.tryGetContext("env")}`)

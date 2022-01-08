import { config } from "../config"

const cf = require('@mapbox/cloudfriend')
const artifacts = require("@davidagold/artifacts")


let airflowRepositoryName = cf.join("-", [cf.stackName, "airflow"])
let registrarRepositoryName = cf.join("-", [cf.stackName, "registrar"])

let Resources = {
    AirflowImageRepository: {
        Type: "AWS::ECR::Repository",
        Properties: {
            RepositoryName: airflowRepositoryName,
        }
    },
    RegistrarImageRepository: {
        Type: "AWS::ECR::Repository",
        Properties: {
            RepositoryName: registrarRepositoryName
        }
    }
}

let Outputs = {
    AirflowImageRepositoryArn: {
        Description: "ARN of Airflow Docker image repository",
        Value: cf.getAtt("AirflowImageRepository", "Arn"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryArn"])
        }
    },
    AirflowRepositoryUri: {
        Description: "URI of Airflow Docker image repository",
        Value: cf.getAtt("AirflowImageRepository", "RepositoryUri"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryUri"])
        }
    },
    RegistrarImageRepositoryArn: {
        Description: "ARN of registrar function Docker image repository",
        Value: cf.getAtt("RegistrarImageRepository", "Arn"),
        Export: {
            Name: cf.join("-", [cf.stackName, "RegistrarImageRepositoryArn"])
        }
    },
}

let npmTokenReadAccessStatement = {
    Sid: "NpmTokenSecretStatement",
    Effect: "Allow",
    Action: "secretsmanager:GetSecretValue",
    Resource: "arn:aws:secretsmanager:us-east-2:510666016636:secret:NpmTokenReadOnlySecret-KOrg9f"
}

let npmTokenEnvVar = {
    Name: "NPM_TOKEN_READ_ONLY",
    Type: "SECRETS_MANAGER",
    Value: "NpmTokenReadOnlySecret:NPM_TOKEN_READ_ONLY"
}

let airflowDockerArtifact = artifacts.docker({
    GitHubAccount: "dag-org",
    GitHubRepositoryName: "bacon",
    EcrRepositoryName: airflowRepositoryName,
    PrivilegedMode: true,
    EnvironmentVariables: [
        npmTokenEnvVar,
        { Name: "MOUNT_POINT", Value: config.airflow.efsMountPoint }
    ],
    InstallCommands: [
        "nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock " +
            "-host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &",
        "timeout 15 sh -c \"until docker info; do echo .; sleep 1; done\""
    ],
    BuildCommands: [
        "(cd airflow && " +
        "docker build " +
        // `dockerRepo` is resolved by artifacts
        "-t ${dockerRepo}:${!CODEBUILD_RESOLVED_SOURCE_VERSION} " + 
        "--build-arg NPM_TOKEN=${!NPM_TOKEN_READ_ONLY} " +
        "--build-arg MOUNT_POINT=${!MOUNT_POINT} .)"
    ],
    ServiceRoleStatements: [npmTokenReadAccessStatement]
})

let registrarDockerArtifact = artifacts.docker({
    GitHubAccount: "dag-org",
    GitHubRepository: "bacon",
    EcrRepositoryName: registrarRepositoryName,
    PrivilegedMode: true,
    EnvironmentVariables: [npmTokenEnvVar],
    BuildCommands: [
        "docker build " +
            "-f Dockerfile.registrar " +
            "-t ${dockerRepo}:${!CODEBUILD_RESOLVED_SOURCE_VERSION} " +
            "--build-arg NPM_TOKEN=${!NPM_TOKEN_READ_ONLY} ."
    ],
    ServiceRoleStatements: [npmTokenReadAccessStatement]
})

module.exports = cf.merge(
    { Resources, Outputs }, 
    airflowDockerArtifact,
    registrarDockerArtifact
)

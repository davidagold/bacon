const cf = require('@mapbox/cloudfriend')
const artifacts = require("@davidagold/artifacts")


let airflowRepositoryName = cf.join("-", [cf.stackName, "airflow"])

let Resources = {
    AirflowImageRepository: {
        Type : "AWS::ECR::Repository",
        Properties: {
            RepositoryName: airflowRepositoryName,
        }
    }
}

let Outputs = {
    AirflowImageRepositoryArn: {
        Description: "ARN of Docker image repository",
        Value: cf.getAtt("AirflowImageRepository", "Arn"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryArn"])
        }
    },
    AirflowRepositoryUri: {
        Description: "URI of container registry",
        Value: cf.getAtt("AirflowImageRepository", "RepositoryUri"),
        Export: {
            Name: cf.join("-", [cf.stackName, "AirflowImageRepositoryUri"])
        }
    }
}

let airflowDockerArtifact = artifacts.docker({
    GitHubAccount: "dag-org",
    GitHubRepositoryName: "bacon",
    EcrRepositoryName: airflowRepositoryName,
    PrivilegedMode: true,
    EnvironmentVariables: [
        {
            Name: "NPM_TOKEN_READ_ONLY",
            Type: "SECRETS_MANAGER",
            Value: "NpmTokenReadOnlySecret:NPM_TOKEN_READ_ONLY"
        }
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
        "--build-arg NPM_TOKEN=${!NPM_TOKEN_READ_ONLY} .)"
    ],
    ServiceRoleStatements: [
        {
            Sid: "NpmTokenSecretStatement",
            Effect: "Allow",
            Action: "secretsmanager:GetSecretValue",
            Resource: "arn:aws:secretsmanager:us-east-2:510666016636:secret:NpmTokenReadOnlySecret-KOrg9f"
        }
    ]
})

module.exports = cf.merge({ Resources, Outputs }, airflowDockerArtifact)

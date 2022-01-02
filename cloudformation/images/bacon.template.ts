const cf = require('@mapbox/cloudfriend')
const artifacts = require("@davidagold/artifacts")


let Resources = {
    ImageRepository: {
        Type : "AWS::ECR::Repository",
        Properties: {
            RepositoryName: cf.stackName,
        }
    }
}

let Outputs = {
    ImageRepositoryArn: {
        Description: "ARN of Docker image repository",
        Value: cf.getAtt("ImageRepository", "Arn")
    },
    RepositoryUri: {
        Description: "URI of container registry",
        Value: cf.getAtt("ImageRepository", "RepositoryUri")
    }
}


module.exports = cf.merge(
    { Resources, Outputs },
    artifacts.docker({
        GitHubAccount: "dag-org",
        GitHubRepositoryName: "bacon",
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
            "-t ${AWS::StackName}:${!CODEBUILD_RESOLVED_SOURCE_VERSION} " +
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
)

import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";


export const statements: PolicyStatement[] = [
    new PolicyStatement({
        sid: "CloudWatchLogsStatement",
        effect: Effect.ALLOW,
        actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
        ],
        resources: ["*"]
    }),
    new PolicyStatement({
        sid: 'CodeBuildStatment',
        actions: [
            'codebuild:StartBuild',
            'codebuild:StopBuild',
            'codebuild:BatchGet*',
            'codebuild:GetResourcePolicy',
            'codebuild:DescribeTestCases',
            'codebuild:List*',
        ],
        effect: Effect.ALLOW,
        resources: ["*"]
    }),
    new PolicyStatement({
        sid: 'SourceProviderStatement',
        actions: [
            'codebuild:ListConnectedOAuthAccounts',
            'codebuild:ListRepositories',
            'codebuild:PersistOAuthToken',
            'codebuild:ImportSourceCredentials'
        ],
        effect: Effect.ALLOW,
        resources: ["*"]
    }),
    new PolicyStatement({
        sid: "NpmTokenSecretStatement",
        effect: Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: ["arn:aws:secretsmanager:us-east-2:510666016636:secret:NpmTokenReadOnlySecret-KOrg9f"]
    }),
    new PolicyStatement({
        sid: "EcrLoginReadWriteStatement",
        effect: Effect.ALLOW,
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ],
        resources: ["*"]
      })
]

import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import helpers = require('../test/helpers')

describe('CodeBuild actions', () => {
  beforeEach(() => {
    helpers.mockDockerCredentials()
  })
  const stack = () => {
    // Like this maybe?
    process.env.CDK_CONTEXT_JSON = JSON.stringify({ dockerhubCredentialsPath: '/path/to/oauth' })
    const app = new cdk.App()
    // app.node.setContext('dockerhubCredentialsPath', '/path/to/oauth')
    // WHEN
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    const hostnamePrefix = 'buzz-test'
    const buzzContext = getContextByNamespace('buzz')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })

    return new BuzzPipelineStack(app, 'MyBuzzPipelineStack', {
      env,
      foundationStack,
      hostnamePrefix,
      ...buzzContext,
      namespace: 'testNamespace',
      oauthTokenPath: '/path/to/oauth',
      ssmPrefix: 'ssmPrefix',
      appSourceArtifact: 'testAppArtifact',
      migrateSecurityGroup: 'sg-123456',
    })
  }
  // Check for Desired resources with proper configurations

  test('creates codebuilds for test DB migration', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'ruby:2.4.4', // this should match what is in the helper class - and only the migrate tasks use the base ruby without app code
        RegistryCredential: {
          Credential: 'test-secret',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'testNamespaceMigrateTestMigrateSecurityGroup8805104E',
              'GroupId',
            ],
          },
          'dummy-value-for-/all/buzz/sg_database_connect',
        ],
      },
    },
    ))
  })

  test('creates codebuilds for prod DB migration', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'ruby:2.4.4', // this should match what is in the helper class - and only the migrate tasks use the base ruby without app code
        RegistryCredential: {
          Credential: 'test-secret',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'testNamespaceMigrateProdMigrateSecurityGroup2984AD20',
              'GroupId',
            ],
          },
          'dummy-value-for-/all/buzz/sg_database_connect',
        ],
      },
    },
    ))
  })

  test('creates smoke test runner', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman:5',
        RegistryCredential: {
          Credential: 'test-secret',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
    }))
  })

  test('creates codebuild for test buzz deployment', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Artifacts: {
        Type: 'CODEPIPELINE',
      },
      Environment: {
        Image: 'aws/codebuild/standard:4.0',
      },
      Source: {
        BuildSpec: '{\n  "artifacts": {\n    "files": []\n  },\n  "phases": {\n    "install": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR/",\n        "npm install"\n      ],\n      "runtime-versions": {\n        "nodejs": "12.x"\n      }\n    },\n    "pre_build": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR_AppCode"\n      ]\n    },\n    "build": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR/",\n        "echo $DOCKER_TOKEN | docker login --username $DOCKER_USERNAME --password-stdin",\n        "npm run cdk deploy -- testNamespace-test-buzz                 --require-approval never --exclusively                 -c \\"namespace=testNamespace-test\\" -c \\"env=test\\"  -c \\"owner=undefined\\" -c \\"contact=undefined\\" -c \\"networkStack=test-network\\" -c \\"domainStack=test-edu-domain\\" -c \\"createDns=true\\" -c \\"buzz:hostnamePrefix=buzz-test\\" -c \\"buzz:appDirectory=$CODEBUILD_SRC_DIR_AppCode\\" -c \\"infraDirectory=$CODEBUILD_SRC_DIR\\""\n      ]\n    },\n    "post_build": {\n      "commands": []\n    }\n  },\n  "version": "0.2"\n}',
        Type: 'CODEPIPELINE',
      },
    }))
  })

  test('creates codebuild for prod buzz deployment', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Artifacts: {
        Type: 'CODEPIPELINE',
      },
      Environment: {
        Image: 'aws/codebuild/standard:4.0',
      },
      Source: {
        BuildSpec: '{\n  "artifacts": {\n    "files": []\n  },\n  "phases": {\n    "install": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR/",\n        "npm install"\n      ],\n      "runtime-versions": {\n        "nodejs": "12.x"\n      }\n    },\n    "pre_build": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR_AppCode"\n      ]\n    },\n    "build": {\n      "commands": [\n        "cd $CODEBUILD_SRC_DIR/",\n        "echo $DOCKER_TOKEN | docker login --username $DOCKER_USERNAME --password-stdin",\n        "npm run cdk deploy -- testNamespace-prod-buzz                 --require-approval never --exclusively                 -c \\"namespace=testNamespace-prod\\" -c \\"env=test\\"  -c \\"owner=undefined\\" -c \\"contact=undefined\\" -c \\"networkStack=undefined\\" -c \\"domainStack=undefined\\" -c \\"createDns=false\\" -c \\"buzz:hostnamePrefix=buzz\\" -c \\"buzz:appDirectory=$CODEBUILD_SRC_DIR_AppCode\\" -c \\"infraDirectory=$CODEBUILD_SRC_DIR\\""\n      ]\n    },\n    "post_build": {\n      "commands": []\n    }\n  },\n  "version": "0.2"\n}',
        Type: 'CODEPIPELINE',
      },
    }))
  })
})

describe('CodePipeline', () => {
  beforeEach(() => {
    helpers.mockDockerCredentials()
  })
  const stack = () => {
    const app = new cdk.App()
    // WHEN
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    const hostnamePrefix = 'buzz-test'
    const buzzContext = getContextByNamespace('buzz')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })

    return new BuzzPipelineStack(app, 'MyBuzzPipelineStack', {
      env,
      foundationStack,
      hostnamePrefix,
      ...buzzContext,
      namespace: 'testNamespace',
      oauthTokenPath: '/path/to/oauth',
      ssmPrefix: 'ssmPrefix',
      appSourceArtifact: 'testAppArtifact',
      migrateSecurityGroup: 'sg-123456',
      dockerhubCredentialsPath: '/path/to/credentials',
    })
  }
  test('creates a CodePipeline with Source, Test, and Production stages', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
          ],
          Name: 'Source',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
          ],
          Name: 'Test',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
          ],
          Name: 'Production',
        },
      ],
    }))
  })

  test('pipeline runs smoke tests after everything but approval', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
          ],
          Name: 'Source',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
              Name: 'SmokeTests',
              RunOrder: 98,
            },
          ],
          Name: 'Test',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
          ],
          Name: 'Production',
        },
      ],
    }))
  })

  test('pipeline runs db migrates before anything else', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
            {
              ActionTypeId: {
                Category: 'Source',
              },
            },
          ],
          Name: 'Source',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
              Name: 'DBMigrate',
              RunOrder: 1,
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
          ],
          Name: 'Test',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
              Name: 'DBMigrate',
              RunOrder: 1,
            },
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
              },
            },
          ],
          Name: 'Production',
        },
      ],
    }))
  })
})

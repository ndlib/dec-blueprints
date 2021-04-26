import { expect as expectCDK, objectLike, haveResourceLike, arrayWith, Capture, encodedJson } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { RailsPipeline, RailsPipelineContainerProps, RailsPipelineProps } from '../../src/pipeline-constructs/rails-pipeline'
import { FoundationStack } from '../../src/foundation-stack'
import { mocked } from 'ts-jest/utils'
import getGiven from 'givens'
import { SecretValue, Stack } from '@aws-cdk/core'
import { ArtifactBucket } from '@ndlib/ndlib-cdk'
import { Repository } from '@aws-cdk/aws-ecr'
import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import { CustomEnvironment } from '../../src/custom-environment'
import { PipelineFoundationStack } from '../../src/pipeline-foundation-stack'
import helpers = require('../../test/helpers')

// A set of variables that won't get set until used
interface lazyEvals {
  vpc: Vpc
  databaseSecurityGroup: SecurityGroup
  env: CustomEnvironment
  app: cdk.App
  foundationStack: FoundationStack
  pipelineFoundationStack: PipelineFoundationStack
  subject: Stack
  stack: Stack
  pipelineProps: RailsPipelineProps
  railsContainer: RailsPipelineContainerProps
}
const lazyEval = getGiven<lazyEvals>()

describe('RailsPipeline', () => {
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    dockerhubCredentialsPath: 'test.context.dockerhubCredentialsPath',
  })
  lazyEval('app', () => new cdk.App())
  lazyEval('stack', () => new Stack(lazyEval.app, 'TestStack'))
  lazyEval('vpc', () => Vpc.fromVpcAttributes(lazyEval.stack, 'test.vpc', {
    vpcId: 'test.vpc.id',
    availabilityZones: [
      'test.vpc.availabilityZone1',
      'test.vpc.availabilityZone2',
    ],
    publicSubnetIds: [
      'test.vpc.publicSubnetId1',
      'test.vpc.publicSubnetId2',
    ],
    privateSubnetIds: [
      'test.vpc.privateSubnetId1',
      'test.vpc.privateSubnetId2',
    ],
  }) as Vpc)
  lazyEval('databaseSecurityGroup', () => SecurityGroup.fromSecurityGroupId(lazyEval.stack, 'test.pipelineProp.testStage.databaseSecurityGroup', 'test.pipelineProp.testStage.databaseSecurityGroupId') as SecurityGroup)
  lazyEval('env', () => ({
    name: 'test.env.name',
    domainName: 'test.env.domainName',
    domainStackName: 'test.env.domainStackName',
    networkStackName: 'test.env.networkStackName',
    region: 'test.env.region',
    account: 'test.env.account',
    createDns: true,
    useVpcId: 'test.env.useVpcId',
    slackNotifyStackName: 'test.env.slackNotifyStackName',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test.env.notificationReceivers',
    alarmsEmail: 'test.env.alarmsEmail',
  }))
  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', { env: lazyEval.env, honeycombHostnamePrefix: 'honeycomb-test' }))
  lazyEval('pipelineFoundationStack', () => new PipelineFoundationStack(lazyEval.app, 'MyPipelineFoundationStack', { env: lazyEval.env }))
  lazyEval('railsContainer', () => ({
    containerName: 'rails',
    ecrNameContextOverride: 'RailsEcrName',
    ecrTagContextOverride: 'RailsEcrTag',
    dockerfile: 'docker/Dockerfile',
    includeRailsMigration: true,
  }))
  lazyEval('pipelineProps', () => ({
    env: lazyEval.env,
    appSource: {
      oauthToken: SecretValue.secretsManager('test.pipelineProp.oauthTokenPath', { jsonField: 'oauth' }),
      branch: 'test.pipelineProp.appSourceBranch',
      owner: 'test.pipelineProp.appRepoOwner',
      repo: 'test.pipelineProp.appRepoName',
    },
    infraSource: {
      oauthToken: SecretValue.secretsManager('test.pipelineProp.oauthTokenPath', { jsonField: 'oauth' }),
      branch: 'test.pipelineProp.infraSourceBranch',
      owner: 'test.pipelineProp.infraRepoOwner',
      repo: 'test.pipelineProp.infraRepoName',
    },
    namespace: 'test.pipelineProp.namespace',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
    ecr: new Repository(lazyEval.stack, 'test.pipelineProp.ecr'),
    artifactBucket: new ArtifactBucket(lazyEval.stack, 'test.pipelineProp.artifactBucket', {}),
    containers: [lazyEval.railsContainer],
    smokeTestPath: 'spec/postman/spec.json',
    testStage: {
      vpc: lazyEval.vpc,
      databaseSecurityGroup: lazyEval.databaseSecurityGroup,
      configPath: 'test.pipelineProp.testStage.configPath',
      namespace: 'test.pipelineProp.testStage.namespace',
      stackname: 'test.pipelineProp.testStage.stackName',
      hostname: 'test.pipelineProp.testStage.hostname',
      // TODO onDeployCreated: spy,
      additionalDeployContext: {
        keyA: 'test.pipelineProp.testStage.additionalDeployContext.keyA',
      },
    },
    prodStage: {
      vpc: lazyEval.vpc,
      databaseSecurityGroup: lazyEval.databaseSecurityGroup,
      configPath: 'test.pipelineProp.prodStage.configPath',
      namespace: 'test.pipelineProp.prodStage.namespace',
      stackname: 'test.pipelineProp.prodStage.stackName',
      hostname: 'test.pipelineProp.prodStage.hostname',
      // TODO onDeployCreated: spy,
      additionalDeployContext: {
        keyA: 'test.pipelineProp.prodStage.additionalDeployContext.keyA',
      },
    },
  }))
  lazyEval('subject', () => {
    const pipeline = new RailsPipeline(lazyEval.stack, 'MyRailsPipelineStack', lazyEval.pipelineProps)
    return lazyEval.stack
  })

  test('creates codebuilds for test DB migration', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'aws/codebuild/standard:2.0',
        EnvironmentVariables: arrayWith(
          {
            Name: 'DOCKERHUB_USERNAME',
            Type: 'SECRETS_MANAGER',
            Value: 'test.pipelineProp.dockerhubCredentialsPath:username',
          },
          {
            Name: 'DOCKERHUB_PASSWORD',
            Type: 'SECRETS_MANAGER',
            Value: 'test.pipelineProp.dockerhubCredentialsPath:password',
          },
          {
            Name: 'RAILS_ENV',
            Type: 'PLAINTEXT',
            Value: 'production',
          },
          {
            Name: 'RAILS_SECRET_KEY_BASE',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/secrets/secret_key_base',
          },
          {
            Name: 'DB_HOSTNAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/database/host',
          },
          {
            Name: 'DB_NAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/database/database',
          },
          {
            Name: 'DB_USERNAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/database/username',
          },
          {
            Name: 'DB_PASSWORD',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/database/password',
          },
          {
            Name: 'DB_PORT',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.testStage.configPath/database/port',
          },
        ),
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'MyRailsPipelineStacktestpipelinePropnamespacerailsMigrateTestMigrateSecurityGroupAE027330',
              'GroupId',
            ],
          },
          'test.pipelineProp.testStage.databaseSecurityGroupId',
        ],
      },
    },
    ))
  })

  test('creates codebuilds for prod DB migration', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'aws/codebuild/standard:2.0',
        EnvironmentVariables: arrayWith(
          {
            Name: 'DOCKERHUB_USERNAME',
            Type: 'SECRETS_MANAGER',
            Value: 'test.pipelineProp.dockerhubCredentialsPath:username',
          },
          {
            Name: 'DOCKERHUB_PASSWORD',
            Type: 'SECRETS_MANAGER',
            Value: 'test.pipelineProp.dockerhubCredentialsPath:password',
          },
          {
            Name: 'RAILS_ENV',
            Type: 'PLAINTEXT',
            Value: 'production',
          },
          {
            Name: 'RAILS_SECRET_KEY_BASE',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/secrets/secret_key_base',
          },
          {
            Name: 'DB_HOSTNAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/database/host',
          },
          {
            Name: 'DB_NAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/database/database',
          },
          {
            Name: 'DB_USERNAME',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/database/username',
          },
          {
            Name: 'DB_PASSWORD',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/database/password',
          },
          {
            Name: 'DB_PORT',
            Type: 'PARAMETER_STORE',
            Value: 'test.pipelineProp.prodStage.configPath/database/port',
          },
        ),
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'MyRailsPipelineStacktestpipelinePropnamespacerailsMigrateProdMigrateSecurityGroupCEA8E714',
              'GroupId',
            ],
          },
          'test.pipelineProp.testStage.databaseSecurityGroupId',
        ],
      },
    },
    ))
  })

  test('test stage runs smoke tests that make requests to the test host, and over https', () => {
    // First make sure that the action sets a TARGET_HOST variable in the env to be the correct host name
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Test',
        Actions: arrayWith(objectLike({
          Name: 'SmokeTests',
          Configuration: objectLike({
            EnvironmentVariables: encodedJson([{
              name: 'TARGET_HOST',
              type: 'PLAINTEXT',
              value: 'test.pipelineProp.testStage.hostname',
            }]),
          }),
        })),
      })),
    }))

    // Then make sure that the build command runs newman with the same TARGET_HOST as the app-host
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      ServiceRole: {
        'Fn::GetAtt': [
          'MyRailsPipelineStacktestpipelinePropnamespaceSmokeTestsRole184979A5',
          'Arn',
        ],
      },
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            build: {
              commands: buildCommands.capture(),
            },
          }),
        })),
      },
    }))
    const regex = /newman run .* --env-var app-host=https:\/\/\$TARGET_HOST/
    expect(buildCommands.capturedValue[0]).toEqual(expect.stringMatching(regex))
  })

  test('smoke tests uses the newman image and gets dockerhub credentials from context', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman:5',
        RegistryCredential: {
          Credential: 'test.context.dockerhubCredentialsPath',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
    }))
  })

  test('calls the CDKPipelineProject with the correct properties to create the test deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../../src/pipeline-constructs/cdk-deploy')
    const CDKPipelineDeploy = (await import('../../src/pipeline-constructs/cdk-deploy')).CdkDeploy
    const RailsPipeline = (await import('../../src/pipeline-constructs/rails-pipeline')).RailsPipeline
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new Stack(lazyEval.app, 'MyTestStack')
    const pipeline = new RailsPipeline(subject, 'MyRailsPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployTest',
      expect.objectContaining({
        additionalContext: {
          appDirectory: '$CODEBUILD_SRC_DIR_AppCode',
          contact: 'test.pipelineProp.contact',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          keyA: 'test.pipelineProp.testStage.additionalDeployContext.keyA',
          owner: 'test.pipelineProp.owner',
        },
        appSource: expect.any(Object),
        containerBuilds: expect.any(Array),
        contextEnvName: 'test.env.name',
        dockerCredentials: expect.any(Object),
        infraSource: expect.any(Object),
        namespace: 'test.pipelineProp.testStage.namespace',
        targetStack: 'test.pipelineProp.testStage.stackName',
      }),
    )
  })

  test('calls the CDKPipelineProject with the correct properties to create the prod deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../../src/pipeline-constructs/cdk-deploy')
    const CDKPipelineDeploy = (await import('../../src/pipeline-constructs/cdk-deploy')).CdkDeploy
    const RailsPipeline = (await import('../../src/pipeline-constructs/rails-pipeline')).RailsPipeline
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new Stack(lazyEval.app, 'MyTestStack')
    const pipeline = new RailsPipeline(subject, 'MyRailsPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployProd',
      expect.objectContaining({
        additionalContext: {
          appDirectory: '$CODEBUILD_SRC_DIR_AppCode',
          contact: 'test.pipelineProp.contact',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          keyA: 'test.pipelineProp.prodStage.additionalDeployContext.keyA',
          owner: 'test.pipelineProp.owner',
        },
        appSource: expect.any(Object),
        containerBuilds: expect.any(Array),
        contextEnvName: 'test.env.name',
        dockerCredentials: expect.any(Object),
        infraSource: expect.any(Object),
        namespace: 'test.pipelineProp.prodStage.namespace',
        targetStack: 'test.pipelineProp.prodStage.stackName',
      }),
    )
  })

  test('creates a CodePipeline with stages in the following order: Source->Build->Test->Production', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', objectLike({
      Stages: [
        objectLike({
          Name: 'Source',
        }),
        objectLike({
          Name: 'Build',
        }),
        objectLike({
          Name: 'Test',
        }),
        objectLike({
          Name: 'Production',
        }),
      ],
    })))
  })

  test('test stage runs actions in the following order: db migration->deploy->smoke tests->approval', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Test',
        Actions: [
          objectLike({
            Name: 'Deploy',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'Migrate-rails',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'SmokeTests',
            RunOrder: 98,
          }),
          objectLike({
            Name: 'Approval',
            RunOrder: 99,
          }),
        ],
      })),
    }))
  })

  test('production stage runs actions in the following order: db migration->deploy', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Production',
        Actions: [
          objectLike({
            Name: 'Deploy',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'Migrate-rails',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'SmokeTests',
            RunOrder: 98,
          }),
        ],
      })),
    }))
  })
})

import { expect as expectCDK, objectLike, haveResourceLike, arrayWith, stringLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BuzzPipelineStack, CDPipelineStackProps } from '../src/buzz/buzz-pipeline'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import { mocked } from 'ts-jest/utils'
import getGiven from 'givens'
import helpers = require('../test/helpers')
import { CustomEnvironment } from '../src/custom-environment'

// A set of variables that won't get set until used
interface lazyEvals {
  env: CustomEnvironment
  app: cdk.App
  foundationStack: FoundationStack
  subject: BuzzPipelineStack
  pipelineProps: CDPipelineStackProps
}
const lazyEval = getGiven<lazyEvals>()

describe('BuzzPipeline', () => {
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    dockerhubCredentialsPath: 'test.context.dockerhubCredentialsPath',
  })

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
  lazyEval('app', () => new cdk.App())
  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', { env: lazyEval.env }))
  lazyEval('pipelineProps', () => ({
    env: lazyEval.env,
    appRepoOwner: 'test.pipelineProp.appRepoOwner',
    appRepoName: 'test.pipelineProp.appRepoName',
    appSourceBranch: 'test.pipelineProp.appSourceBranch',
    infraRepoOwner: 'test.pipelineProp.infraRepoOwner',
    infraRepoName: 'test.pipelineProp.infraRepoName',
    infraSourceBranch: 'test.pipelineProp.infraSourceBranch',
    foundationStack: lazyEval.foundationStack,
    namespace: 'test.pipelineProp.namespace',
    oauthTokenPath: 'test.pipelineProp.oauthTokenPath',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    hostnamePrefix: 'test.pipelineProp.hostnamePrefix',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
  }))
  lazyEval('subject', () => new BuzzPipelineStack(lazyEval.app, 'MyBuzzPipelineStack', lazyEval.pipelineProps))

  test('creates codebuilds for test DB migration', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'ruby:2.4.4', // this should match what is in the helper class - and only the migrate tasks use the base ruby without app code
        RegistryCredential: {
          Credential: 'test.pipelineProp.dockerhubCredentialsPath',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'testpipelinePropnamespaceMigrateTestMigrateSecurityGroup762A6562',
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
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'ruby:2.4.4', // this should match what is in the helper class - and only the migrate tasks use the base ruby without app code
        RegistryCredential: {
          Credential: 'test.pipelineProp.dockerhubCredentialsPath',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'testpipelinePropnamespaceMigrateProdMigrateSecurityGroup34D46097',
              'GroupId',
            ],
          },
          'dummy-value-for-/all/buzz/sg_database_connect',
        ],
      },
    },
    ))
  })

  test('test stage runs smoke tests that make requests to the test host', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: {
          'Fn::Join': [
            '',
            [
              // stringLike's wildcard doesn't seem to consume \n characters, so this is a bit more explicit of a match than I'd like
              stringLike('{\n*"phases": {\n*"build": {\n*"commands": [\n*"newman run * --env-var app-host=test.pipelineProp.hostnamePrefix-test.'),
              {
                'Fn::ImportValue': 'test.env.domainStackName:DomainName',
              },
              stringLike('*--env-var host-protocol=https"\n*]\n*}\n*},\n*\n}'),
            ],
          ],
        },
      },
    }))
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
    jest.doMock('../src/cdk-pipeline-deploy')
    const CDKPipelineDeploy = (await import('../src/cdk-pipeline-deploy')).CDKPipelineDeploy
    const BuzzPipelineStack = (await import('../src/buzz/buzz-pipeline')).BuzzPipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new BuzzPipelineStack(lazyEval.app, 'MyBuzzPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployTest', // Creates a CodeBuild project with an id of namespace-DeployTest
      expect.objectContaining({
        namespace: 'test.pipelineProp.namespace-test', // Adds -test to the provided namespace
        targetStack: 'test.pipelineProp.namespace-test-buzz', // Targets the test stack
        contextEnvName: 'test.env.name',
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        additionalContext: {
          'buzz:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'buzz:hostnamePrefix': 'test.pipelineProp.hostnamePrefix-test', // Adds -test to the provided hostname
          createDns: 'true',
          domainStack: 'test.env.domainStackName',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          networkStack: 'test.env.networkStackName',
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
        },
      }),
    )
  })

  test('calls the CDKPipelineProject with the correct properties to create the prod deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/cdk-pipeline-deploy')
    const CDKPipelineDeploy = (await import('../src/cdk-pipeline-deploy')).CDKPipelineDeploy
    const BuzzPipelineStack = (await import('../src/buzz/buzz-pipeline')).BuzzPipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new BuzzPipelineStack(lazyEval.app, 'MyBuzzPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployProd', // Creates a CodeBuild project with an id of namespace-DeployProd
      expect.objectContaining({
        namespace: 'test.pipelineProp.namespace-prod', // Adds -prod to the provided namespace
        targetStack: 'test.pipelineProp.namespace-prod-buzz', // Targets the prod stack
        contextEnvName: 'test.env.name',
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        additionalContext: {
          'buzz:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'buzz:hostnamePrefix': 'test.pipelineProp.hostnamePrefix', // Uses the provided hostname without modification
          createDns: 'true',
          domainStack: 'test.env.domainStackName',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          networkStack: 'test.env.networkStackName',
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
        },
      }),
    )
  })

  test('creates a CodePipeline with stages in the following order: Source->Test->Production', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', objectLike({
      Stages: [
        objectLike({
          Name: 'Source',
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
            Name: 'DBMigrate',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'Deploy',
            RunOrder: 2,
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
            Name: 'DBMigrate',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'Deploy',
            RunOrder: 2,
          }),
        ],
      })),
    }))
  })
})

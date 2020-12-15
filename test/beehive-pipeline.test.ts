import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../src/foundation-stack'
import { BeehivePipelineStack } from '../src/beehive/beehive-pipeline'
import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'

describe('BeehivePipeline', () => {
  const app = new cdk.App()
  const env = {
    name: 'test',
    domainName: 'test.edu',
    domainStackName: 'test-edu-domain',
    networkStackName: 'test-network',
    region: 'test-region',
    account: 'test-account',
    createDns: true,
    slackNotifyStackName: 'slack-test',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test@test.edu',
    alarmsEmail: 'test@test.edu',
    oauthTokenPath: 'test-oauthTokenPath',
  }
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
  const subject = new BeehivePipelineStack(app, 'PipelineTest', {
    env,
    appRepoOwner: 'test_appRepoOwner',
    appRepoName: 'test_appRepoName',
    appSourceBranch: 'test_appSourceBranch',
    infraRepoOwner: 'test_infraRepoOwner',
    infraRepoName: 'test_infraRepoName',
    infraSourceBranch: 'test_infraSourceBranch',
    namespace: 'test_namespace',
    qaSpecPath: 'test_qaSpecPath',
    oauthTokenPath: 'test_oauthTokenPath',
    hostnamePrefix: 'test_hostnamePrefix',
    dockerhubCredentialsPath: 'test_dockerCredentialsPath',
    networkStackName: 'test_networkStackName',
    domainStackName: 'test_domainStackName',
    owner: 'test_owner',
    contact: 'test_contact',
    createDns: true,
    slackNotifyStackName: 'test_slackstack',
    notificationReceivers: 'test_notificationReceivers',
    foundationStack,
  })

  xtest('uses encrypted artifact bucket', () => {
    // const pipelineStack = subject()
    expectCDK(subject).to(haveResourceLike('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
            },
          },
        ],
      },
    }))
  })

  /*
  test('deploy test stack', () => {
    expectCDK(subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'aws/codebuild/standard:4.0',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'thdecDeployTestProjectRoleB3F40C5E',
          'Arn',
        ],
      },
    }))
  })
*/
  test.todo('deploy prod stack')

  test('runs smoke test against test stack', () => {
    expectCDK(subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsTestRoleF3DD8E52',
          'Arn',
        ],
      },
    }))
  })
  test.todo('waits for approval at test stage')
  test('runs smoke test against prod stack', () => {
    expectCDK(subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsProdRole8965C9BD',
          'Arn',
        ],
      },
    }))
  })

  test('Has and SNS approval topic', () => {
    expectCDK(subject).to(haveResource('AWS::SNS::Topic'))
  })
})

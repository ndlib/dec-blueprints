import { expect as expectCDK, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../../lib/foundation-stack'
import { HoneycombStack } from '../../lib/honeycomb/honeycomb-stack'
import { mocked } from 'ts-jest/utils'
import { SolrConstruct } from '../../lib/honeycomb/solr-construct'
import { RabbitMqConstruct } from '../../lib/honeycomb/rabbitmq-construct'
import { RailsConstruct } from '../../lib/honeycomb/rails-construct'
import { CustomEnvironment } from '../../lib/custom-environment'

jest.mock('../../lib/honeycomb/solr-construct')
const MockedSolrConstruct = mocked(SolrConstruct)
jest.mock('../../lib/honeycomb/rabbitmq-construct')
const MockedRabbitMqConstruct = mocked(RabbitMqConstruct)
jest.mock('../../lib/honeycomb/rails-construct')
const MockedRailsConstruct = mocked(RailsConstruct)

describe('HoneycombStack', () => {
  let env: CustomEnvironment
  let app: cdk.App
  let foundationStack: FoundationStack
  let appDirectory: string
  let hostnamePrefix: string
  let subject: HoneycombStack

  beforeEach(() => {
    appDirectory = './test/fixtures'
    hostnamePrefix = 'test-hostname'
    env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: true,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    app = new cdk.App()
    foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    subject = new HoneycombStack(app, 'MyTestHoneycombStack', {
      env,
      appDirectory,
      foundationStack,
      hostnamePrefix,
    })
  })

  test('creates an encrypted EFS that will move to infrequent access tier after 30 days', () => {
    expectCDK(subject).to(haveResourceLike('AWS::EFS::FileSystem', {
      Encrypted: true,
      LifecyclePolicies: [{ TransitionToIA: 'AFTER_30_DAYS' }],
    }))
  })

  test('creates a security group for the resources in the app to use', () => {
    expectCDK(subject).to(haveResourceLike('AWS::EC2::SecurityGroup', {
      GroupDescription: 'MyTestHoneycombStack/appSecurityGroup',
      VpcId: { 'Fn::ImportValue': 'test-network:VPCID' },
    }))
  })

  test('creates an instance of SolrConstruct', () => {
    expect(MockedSolrConstruct).toHaveBeenCalledWith(subject, 'Solr', expect.objectContaining({
      env,
      appDirectory,
      vpc: foundationStack.vpc,
      cluster: foundationStack.cluster,
      logs: foundationStack.logs,
      privateNamespace: foundationStack.privateNamespace,
    }))
  })

  test('creates an instance of RailsConstruct', () => {
    expect(MockedRailsConstruct).toHaveBeenCalledWith(subject, 'Rails', expect.objectContaining({
      env,
      vpc: foundationStack.vpc,
      cluster: foundationStack.cluster,
      logs: foundationStack.logs,
      privateNamespace: foundationStack.privateNamespace,
      publicLoadBalancer: foundationStack.publicLoadBalancer,
      appDirectory,
      hostnamePrefix,
      solr: MockedSolrConstruct.mock.instances[0],
      rabbitMq: MockedRabbitMqConstruct.mock.instances[0],
    }))
  })

  test('creates an instance of RabbitMqConstruct', () => {
    expect(MockedRabbitMqConstruct).toHaveBeenCalledWith(subject, 'RabbitMq', expect.objectContaining({
      env,
      vpc: foundationStack.vpc,
    }))
  })
})

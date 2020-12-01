import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { Stack } from '@aws-cdk/core'
import { FoundationStack } from '../../src/foundation-stack'
import { RabbitMqConstruct } from '../../src/honeycomb/rabbitmq-construct'
import { SecurityGroup } from '@aws-cdk/aws-ec2'
import * as helpers from '../helpers'
import { Alarm } from '@aws-cdk/aws-cloudwatch'

describe('RabbitMqConstruct', () => {
  let rabbitMq: RabbitMqConstruct

  const stack = (publicFacing?: boolean) => {
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
      useExistingDnsZone: true,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    const app = new cdk.App()
    const stack = new Stack(app, 'MyStack', { env })
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    const appSecurityGroup = new SecurityGroup(stack, 'appSecurityGroup', {
      vpc: foundationStack.vpc,
      allowAllOutbound: true,
    })
    rabbitMq = new RabbitMqConstruct(stack, 'RabbitMq', {
      env,
      vpc: foundationStack.vpc,
      appSecurityGroup,
      brokerName: 'my-rabbit-broker-name',
    })
    return stack
  }

  test('creates a private RabbitMq broker', () => {
    const newStack = stack()
    const rabbitSgLogicalId = 'RabbitMqmqSecurityGroupC3ACEFF5'
    // First make sure it puts the broker in this SG
    expectCDK(newStack).to(haveResourceLike('AWS::AmazonMQ::Broker', {
      BrokerName: 'my-rabbit-broker-name',
      SecurityGroups: [
        {
          'Fn::GetAtt': [
            rabbitSgLogicalId,
            'GroupId',
          ],
        },
      ],
    }))
    // Then make sure that it adds an ingress rule from the app SG to the rabbit SG
    expectCDK(newStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5671,
      GroupId: {
        'Fn::GetAtt': [
          rabbitSgLogicalId,
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'appSecurityGroupBD419CAB',
          'GroupId',
        ],
      },
      ToPort: 5671,
    }))
  })

  test('allows the application security group to connect to the broker', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::AmazonMQ::Broker', {
      BrokerName: 'my-rabbit-broker-name',
      DeploymentMode: 'SINGLE_INSTANCE',
      EngineType: 'RABBITMQ',
      PubliclyAccessible: false,
      SubnetIds: [
        {
          'Fn::ImportValue': 'test-network:PrivateSubnet1ID',
        },
      ],
    }))
  })

  test('creates and uses a secret in secrets manager', () => {
    const newStack = stack()
    const rabbitSecretLogicalId = 'RabbitMqRabbitMqSecretF2308523'
    const secret = helpers.getPropertiesByLogicalId(newStack, rabbitSecretLogicalId)
    expect(secret).toEqual(expect.objectContaining({
      GenerateSecretString: {
        ExcludeCharacters: ', :=',
        ExcludePunctuation: true,
        GenerateStringKey: 'password',
        SecretStringTemplate: '{"login":"honeycomb"}',
      },
      Name: `/all/${newStack.stackName}/rabbitmq`,
    }))
    expectCDK(newStack).to(haveResourceLike('AWS::AmazonMQ::Broker', {
      BrokerName: 'my-rabbit-broker-name',
      Users: [
        {
          Password: {
            'Fn::Join': [
              '',
              [
                '{{resolve:secretsmanager:',
                {
                  Ref: rabbitSecretLogicalId,
                },
                ':SecretString:password::}}',
              ],
            ],
          },
          Username: {
            'Fn::Join': [
              '',
              [
                '{{resolve:secretsmanager:',
                {
                  Ref: rabbitSecretLogicalId,
                },
                ':SecretString:login::}}',
              ],
            ],
          },
        },
      ],
    }))
  })

  test('creates a metric that a worker service can use in a CloudWatch Alarm to scale on remaining image jobs', () => {
    const newStack = stack()

    // Add an alarm so that the metric gets synthesized into the template
    const alarm = new Alarm(newStack, 'TestScaleAlarm', {
      metric: rabbitMq.scaleMetric,
      threshold: 0,
      evaluationPeriods: 0,
    })

    // Check that the alarm's metric is an expression that sums the number of messages in
    // the image and image retry queues
    expectCDK(newStack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
      Metrics: [
        {
          Expression: 'imageJobsMetric + imageRetryJobsMetric',
          Id: 'expr_1',
        },
        {
          Id: 'imageRetryJobsMetric',
          MetricStat: {
            Metric: {
              Dimensions: [
                {
                  Name: 'Broker',
                  Value: 'my-rabbit-broker-name',
                },
                {
                  Name: 'Queue',
                  Value: 'honeypot_images-retry',
                },
                {
                  Name: 'VirtualHost',
                  Value: '/',
                },
              ],
              MetricName: 'MessageCount',
              Namespace: 'AWS/AmazonMQ',
            },
            Period: 60,
            Stat: 'Maximum',
          },
          ReturnData: false,
        },
        {
          Id: 'imageJobsMetric',
          MetricStat: {
            Metric: {
              Dimensions: [
                {
                  Name: 'Broker',
                  Value: 'my-rabbit-broker-name',
                },
                {
                  Name: 'Queue',
                  Value: 'honeypot_images',
                },
                {
                  Name: 'VirtualHost',
                  Value: '/',
                },
              ],
              MetricName: 'MessageCount',
              Namespace: 'AWS/AmazonMQ',
            },
            Period: 60,
            Stat: 'Maximum',
          },
          ReturnData: false,
        },
      ],
    }))
  })
})

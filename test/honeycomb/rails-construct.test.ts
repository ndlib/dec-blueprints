import { expect as expectCDK, haveResource, haveResourceLike, SynthUtils } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { RemovalPolicy, Stack } from '@aws-cdk/core'
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs'
import { FoundationStack } from '../../src/foundation-stack'
import { RailsConstruct } from '../../src/honeycomb/rails-construct'
import { SecurityGroup } from '@aws-cdk/aws-ec2'
import { SolrConstruct } from '../../src/honeycomb/solr-construct'
import { RabbitMqConstruct } from '../../src/honeycomb/rabbitmq-construct'
import * as helpers from '../helpers'

describe('RailsConstruct', () => {
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
    const appSecurityGroup = new SecurityGroup(stack, 'MyAppSecurityGroup', {
      vpc: foundationStack.vpc,
    })
    const fileSystem = new FileSystem(stack, 'MyFileSystem', {
      vpc: foundationStack.vpc,
    })
    const solr = new SolrConstruct(stack, 'MySolrConstruct', {
      env,
      vpc: foundationStack.vpc,
      cluster: foundationStack.cluster,
      logs: foundationStack.logs,
      privateNamespace: foundationStack.privateNamespace,
      appDirectory: './test/fixtures',
      fileSystem,
    })
    rabbitMq = new RabbitMqConstruct(stack, 'MyRabbitMq', {
      env,
      vpc: foundationStack.vpc,
      appSecurityGroup,
      brokerName: 'my-rabbit-broker-name',
    })
    const rails = new RailsConstruct(stack, 'MyRails', {
      env,
      vpc: foundationStack.vpc,
      cluster: foundationStack.cluster,
      logs: foundationStack.logs,
      privateNamespace: foundationStack.privateNamespace,
      publicLoadBalancer: foundationStack.publicLoadBalancer,
      appDirectory: './test/fixtures',
      hostnamePrefix: 'my-rails-host',
      appSecurityGroup,
      fileSystem,
      solr,
      rabbitMq,
    })
    return stack
  }

  test('creates a rails service within the shared cluster', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MyRailsRailsTaskDefinition46D5248A',
      },
      Cluster: {
        'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefClusterEB0386A796A0E3FE',
      },
    }))
  })

  test('puts the application in the given appSecurityGroup and in the security group to allow it to connect to the database', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MyRailsRailsTaskDefinition46D5248A',
      },
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          SecurityGroups: [
            'dummy-value-for-/all/MyStack/sg_database_connect',
            {
              'Fn::GetAtt': [
                'MyAppSecurityGroup325F274B',
                'GroupId',
              ],
            },
          ],
        },
      },
    }))
  })

  test('allows the application security group to use the shared EFS', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 2049,
      GroupId: {
        'Fn::GetAtt': [
          'MyFileSystemEfsSecurityGroup06D0DEC4',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'MyAppSecurityGroup325F274B',
          'GroupId',
        ],
      },
      ToPort: 2049,
    }))
  })

  test('logs to the shared log group', () => {
    const newStack = stack()
    const railsTaskProperties = helpers.getPropertiesByLogicalId(newStack, 'MyRailsRailsTaskDefinition46D5248A')
    expect(railsTaskProperties.ContainerDefinitions).toEqual(
      expect.arrayContaining([expect.objectContaining({
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': {
              'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefSharedLogGroup74BE6F74A76E1763',
            },
            'awslogs-region': 'test-region',
            'awslogs-stream-prefix': 'MyStack-ServiceTask',
          },
        },
        Name: 'railsContainer',
      })]),
    )
  })

  test('shares the precompiled assets in the rails container with the nginx container', () => {
    const newStack = stack()
    const railsTaskProperties = helpers.getPropertiesByLogicalId(newStack, 'MyRailsRailsTaskDefinition46D5248A')
    expect(railsTaskProperties.ContainerDefinitions).toEqual(
      expect.arrayContaining([expect.objectContaining({
        Name: 'nginxContainer',
        VolumesFrom: [
          {
            ReadOnly: true,
            SourceContainer: 'railsContainer',
          },
        ],
      })]),
    )
  })

  test('adds the rails service to the shared ALB', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Actions: [
        {
          TargetGroupArn: {
            Ref: 'MyRailsTargetGroup63C00DA0',
          },
          Type: 'forward',
        },
      ],
      Conditions: [
        {
          Field: 'host-header',
          Values: [
            {
              'Fn::Join': [
                '',
                [
                  'my-rails-host.',
                  {
                    'Fn::ImportValue': 'test-edu-domain:DomainName',
                  },
                ],
              ],
            },
          ],
        },
        {
          Field: 'path-pattern',
          Values: [
            '*',
          ],
        },
      ],
      ListenerArn: {
        'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefPublicLoadBalancerHttpsListenerE589A82C3A3FF281',
      },
    }))
  })

  test('creates a sneakers service within the shared cluster', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MyRailsSneakersTaskDefinition7A25357B',
      },
      Cluster: {
        'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefClusterEB0386A796A0E3FE',
      },
    }))
  })

  test('scales the sneakers service up when there are one or more image jobs in the rabbit queue', () => {
    const newStack = stack()
    // First find the specific AWS::ApplicationAutoScaling::ScalingPolicy by id and see that it targets
    // the sneakers service
    const policyName = 'MyRailsSneakersServiceTaskCountTargetTrackImageJobsUpperPolicy8B963818'
    const scalingPolicy = helpers.getPropertiesByLogicalId(newStack, policyName)
    expect(scalingPolicy).toEqual(expect.objectContaining({
      PolicyName: 'MyStackMyRailsSneakersServiceTaskCountTargetTrackImageJobsUpperPolicyA5129B9B',
      PolicyType: 'StepScaling',
      ScalingTargetId: {
        Ref: 'MyRailsSneakersServiceTaskCountTarget3A897305',
      },
      StepScalingPolicyConfiguration: {
        AdjustmentType: 'ExactCapacity',
        StepAdjustments: [
          {
            MetricIntervalLowerBound: 0,
            MetricIntervalUpperBound: 50,
            ScalingAdjustment: 1,
          },
          {
            MetricIntervalLowerBound: 50,
            MetricIntervalUpperBound: 100,
            ScalingAdjustment: 2,
          },
          {
            MetricIntervalLowerBound: 100,
            ScalingAdjustment: 3,
          },
        ],
      },
    }))

    // Make sure there's an alarm that, when jobs are >= 1, it alerts the policy above
    expectCDK(newStack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      EvaluationPeriods: 1,
      AlarmActions: [
        {
          Ref: policyName,
        },
      ],
      AlarmDescription: 'Upper threshold scaling alarm',
      Metrics: [
        {
          // I'm assuming these are being tested in RabbitMqConstruct,
          // so not fully testing the metrics here
          Expression: 'imageJobsMetric + imageRetryJobsMetric',
        },
      ],
      Threshold: 1,
    }))
  })

  test('scales the sneakers service down to 0 when there are no image jobs in the rabbit queue', () => {
    const newStack = stack()
    // First find the specific AWS::ApplicationAutoScaling::ScalingPolicy by id and see that it targets
    // the sneakers service
    const policyName = 'MyRailsSneakersServiceTaskCountTargetTrackImageJobsLowerPolicy4ADD3C5C'
    const scalingPolicy = helpers.getPropertiesByLogicalId(newStack, policyName)
    expect(scalingPolicy).toEqual(expect.objectContaining({
      PolicyName: 'MyStackMyRailsSneakersServiceTaskCountTargetTrackImageJobsLowerPolicy6D458B47',
      PolicyType: 'StepScaling',
      ScalingTargetId: {
        Ref: 'MyRailsSneakersServiceTaskCountTarget3A897305',
      },
      StepScalingPolicyConfiguration: {
        AdjustmentType: 'ExactCapacity',
        StepAdjustments: [
          {
            MetricIntervalUpperBound: 0,
            ScalingAdjustment: 0,
          },
        ],
      },
    }))

    // Make sure there's an alarm that, when jobs are <= 0, it alerts the policy above
    expectCDK(newStack).to(haveResourceLike('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'LessThanOrEqualToThreshold',
      EvaluationPeriods: 1,
      AlarmActions: [
        {
          Ref: policyName,
        },
      ],
      AlarmDescription: 'Lower threshold scaling alarm',
      Metrics: [
        {
          // I'm assuming these are being tested in RabbitMqConstruct,
          // so not fully testing the metrics here
          Expression: 'imageJobsMetric + imageRetryJobsMetric',
        },
      ],
      Threshold: 0,
    }))
  })
})

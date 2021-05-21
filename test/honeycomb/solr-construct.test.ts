import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { RemovalPolicy, Stack } from '@aws-cdk/core'
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs'
import { FoundationStack } from '../../src/foundation-stack'
import { SolrConstruct } from '../../src/honeycomb/solr-construct'
import * as helpers from '../helpers'

describe('SolrConstruct', () => {
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
      databaseConnectSG: 'test.env.databaseConnectSG',
    }
    const app = new cdk.App()
    const stack = new Stack(app, 'MyStack', { env })
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    const fileSystem = new FileSystem(stack, 'MyFileSystem', {
      vpc: foundationStack.vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
      encrypted: true,
    })
    const solr = new SolrConstruct(stack, 'MySolrConstruct', {
      env,
      vpc: foundationStack.vpc,
      cluster: foundationStack.cluster,
      logs: foundationStack.logs,
      privateNamespace: foundationStack.privateNamespace,
      appDirectory: './test/fixtures',
      fileSystem,
      publicLoadBalancer: publicFacing ? foundationStack.publicLoadBalancer : undefined,
      hostnamePrefix: publicFacing ? 'my-solr-host' : undefined,
    })
    return stack
  }

  test('creates a solr service within the shared cluster', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MySolrConstructTaskDefinition516F547E',
      },
      Cluster: {
        'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefClusterEB0386A796A0E3FE',
      },
    }))
  })

  test('creates a solr service that is not available to the public', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MySolrConstructTaskDefinition516F547E',
      },
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: 'DISABLED',
          Subnets: [
            {
              'Fn::ImportValue': 'test-network:PrivateSubnet1ID',
            },
            {
              'Fn::ImportValue': 'test-network:PrivateSubnet2ID',
            },
          ],
        },
      },
    }))
  })

  test('creates a solr service with an associated entry in the shared private ns', () => {
    const newStack = stack()
    const cloudmapServiceLogicalId = 'MySolrConstructServiceCloudmapServiceAEB7829B'
    // First find the logical id in they synthesized template and check that it adds a record to
    // the foundation stack's shared private namespace
    const properties = expectCDK(newStack).value.Resources[cloudmapServiceLogicalId].Properties
    expect(properties).toMatchObject({
      DnsConfig: {
        DnsRecords: [
          {
            TTL: 60,
            Type: 'A',
          },
        ],
        NamespaceId: {
          'Fn::ImportValue': 'MyFoundationStack:ExportsOutputFnGetAttPrivateNamespace147795D2IdB40357EC',
        },
        RoutingPolicy: 'MULTIVALUE',
      },
      HealthCheckCustomConfig: {
        FailureThreshold: 1,
      },
      Name: 'solr',
      NamespaceId: {
        'Fn::ImportValue': 'MyFoundationStack:ExportsOutputFnGetAttPrivateNamespace147795D2IdB40357EC',
      },
    })
    // Then check that the solr service adds the service registry using the same logical id above
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MySolrConstructTaskDefinition516F547E',
      },
      ServiceRegistries: [
        {
          RegistryArn: {
            'Fn::GetAtt': [
              cloudmapServiceLogicalId,
              'Arn',
            ],
          },
        },
      ],
    }))
  })

  test('creates a solr service that has access to the EFS', () => {
    const newStack = stack()
    const solrSecurityGroupLogicalId = 'MySolrConstructAppSecurityGroupDFB679DA'
    // First check that the service is assigned to the correct security group id
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'MySolrConstructTaskDefinition516F547E',
      },
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: 'DISABLED',
          SecurityGroups: [
            {
              'Fn::GetAtt': [
                solrSecurityGroupLogicalId,
                'GroupId',
              ],
            },
          ],
        },
      },
    }))
    // Next check that the security group can connect via nfs to the EFS SG
    expectCDK(newStack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress', {
      FromPort: 2049,
      ToPort: 2049,
      GroupId: {
        'Fn::GetAtt': [
          solrSecurityGroupLogicalId,
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'MyFileSystemEfsSecurityGroup06D0DEC4',
          'GroupId',
        ],
      },
    }))
  })

  test('logs to the shared log group', () => {
    const newStack = stack()
    const railsTaskProperties = helpers.getPropertiesByLogicalId(newStack, 'MySolrConstructTaskDefinition516F547E')
    expect(railsTaskProperties.ContainerDefinitions).toEqual(
      expect.arrayContaining([expect.objectContaining({
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': {
              'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefSharedLogGroup74BE6F74A76E1763',
            },
            'awslogs-region': 'test-region',
            'awslogs-stream-prefix': 'MyStack-SolrTask',
          },
        },
        Name: 'Solr',
      })]),
    )
  })

  describe('when not given a public facing ALB', () => {
    test('does not create a listener rule', () => {
      const newStack = stack()
      expectCDK(newStack).notTo(haveResource('AWS::ElasticLoadBalancingV2::ListenerRule'))
    })
  })

  describe('when given a public facing ALB', () => {
    test('adds a listener rule', () => {
      const newStack = stack(true)
      expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
        Actions: [
          {
            TargetGroupArn: {
              Ref: 'MySolrConstructTargetGroup70218A1F',
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
                    'my-solr-host.',
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
        Priority: 1,
      }))
    })
  })
})

import { PolicyStatement } from '@aws-cdk/aws-iam'
import { CfnCondition, Fn, Stack } from '@aws-cdk/core'

export enum GlobalActions {
  None,
  S3,
  Cloudfront,
  Route53,
  ECR,
  EC2,
  ECS,
  ALB,
  EFS,
  AutoScaling,
  Secrets,
  MQ,
  CloudMap,
}

export class NamespacedPolicy {
  // For actions that only support '*', ie cannot be namespaced
  public static globals (actionOptions: GlobalActions[]): PolicyStatement {
    let actions : string[] = []
    if (actionOptions.includes(GlobalActions.S3)) {
      actions.push('s3:CreateBucket')
    }
    if (actionOptions.includes(GlobalActions.Cloudfront)) {
      actions = [...actions,
        'cloudfront:TagResource',
        'cloudfront:CreateDistribution',
        'cloudfront:GetDistribution',
        'cloudfront:UpdateDistribution',
        'cloudfront:DeleteDistribution',
        'cloudfront:CreateCloudFrontOriginAccessIdentity',
        'cloudfront:GetCloudFrontOriginAccessIdentity',
        'cloudfront:GetCloudFrontOriginAccessIdentityConfig',
        'cloudfront:UpdateCloudFrontOriginAccessIdentity',
        'cloudfront:DeleteCloudFrontOriginAccessIdentity',
      ]
    }
    if (actionOptions.includes(GlobalActions.Route53)) {
      actions = [...actions,
        'route53:ListHostedZones',
        'route53:GetHostedZone',
        'route53:ChangeResourceRecordSets',
        'route53:GetChangeRequest',
        'route53:GetChange',
      ]      
    }
    if (actionOptions.includes(GlobalActions.ECR)) {
      actions = [...actions,
        'ecr:DescribeRepositories',
        'ecr:GetAuthorizationToken',
      ]
    }
    if (actionOptions.includes(GlobalActions.EC2)) {
      actions = [...actions,
        'ec2:Describe*',
      ]
    }
    if (actionOptions.includes(GlobalActions.ECS)) {
      actions = [...actions,
        'ecs:RegisterTaskDefinition',
        'ecs:DeregisterTaskDefinition',
        'ecs:CreateCluster',
      ]
    }
    if (actionOptions.includes(GlobalActions.ALB)) {
      actions = [...actions,
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeListeners',
        'elasticloadbalancing:DescribeRules',
      ]
    }    
    if (actionOptions.includes(GlobalActions.EFS)) {
      actions = [...actions,
        'elasticfilesystem:DescribeFileSystems',
        'elasticfilesystem:CreateFileSystem',
        'elasticfilesystem:CreateMountTarget',
        'elasticfilesystem:DescribeMountTargets',
        'elasticfilesystem:ListTagsForResource',
        'elasticfilesystem:UntagResource',
        'elasticfilesystem:TagResource',
        'elasticfilesystem:DescribeFileSystemPolicy',
        'elasticfilesystem:PutLifecycleConfiguration',
      ]
    }
    if (actionOptions.includes(GlobalActions.EFS)) {
      actions = [...actions,
        'elasticfilesystem:CreateFileSystem',
      ]
    }
    if (actionOptions.includes(GlobalActions.AutoScaling)) {
      actions.push('application-autoscaling:*')
    }
    if (actionOptions.includes(GlobalActions.Secrets)) {
      actions = [...actions,
        'secretsmanager:GetRandomPassword',
        'secretsmanager:ListSecrets',
      ]
    }
    if (actionOptions.includes(GlobalActions.MQ)) {
      actions = [...actions,
        'mq:CreateBroker',
        'mq:CreateTags',
        'mq:CreateConfiguration',
        'mq:DeleteTags',
        'mq:DescribeBrokerEngineTypes',
        'mq:DescribeBrokerInstanceOptions',
        'mq:ListBrokers',
        'mq:ListConfigurations',
      ]
    }
    if (actionOptions.includes(GlobalActions.CloudMap)) {
      actions = [...actions,
        'servicediscovery:CreateHttpNamespace',
        'servicediscovery:CreatePrivateDnsNamespace',
        'servicediscovery:CreatePublicDnsNamespace',
        'servicediscovery:CreateService',
        'servicediscovery:GetOperation',
        'servicediscovery:GetService',
        'servicediscovery:ListNamespaces',
        'servicediscovery:ListOperations',
        'servicediscovery:ListServices',
        'servicediscovery:ListTagsForResource',
        'servicediscovery:TagResource',
        'servicediscovery:UntagResource',
      ]
    }
    return new PolicyStatement({
      resources: ['*'],
      actions,
    })
  }

  // This is sort of a global, but I don't want to put it in globals. Doing so
  // would give full permissions to domains, since domains are under apigateway actions.
  public static api (): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/account'),
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/restapis'),
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/restapis/*'),
      ],
      actions: [
        'apigateway:*',
      ],
    })
  }

  // This is also resource-type specific, but can't do a namespace
  public static cloudmap (): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:servicediscovery:${AWS::Region}:${AWS::AccountId}:namespace/*'),
        Fn.sub('arn:aws:servicediscovery:${AWS::Region}:${AWS::AccountId}:service/*'),
      ],
      actions: [
        'servicediscovery:*',
      ],
    })
  }

  // This is also resource-type specific, but can't do a namespace
  public static efs (): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:elasticfilesystem:${AWS::Region}:${AWS::AccountId}:file-system/*'),
        Fn.sub('arn:aws:elasticfilesystem:${AWS::Region}:${AWS::AccountId}:access-point/*'),
      ],
      actions: [
        'elasticfilesystem:*',
      ],
    })
  }

  // This is also resource-type specific, but can't do a namespace
  public static ec2 (): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:instance/*'),
        Fn.sub('arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*'),
        Fn.sub('arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:security-group/*'),
        Fn.sub('arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:vpc/*'),
      ],
      actions: [
        'ec2:createTags',
        'ec2:DetachNetworkInterface',
        'ec2:DeleteNetworkInterface',
        'ec2:AuthorizeSecurityGroupEgress',
        'ec2:AuthorizeSecurityGroupIngress',
        'ec2:CreateSecurityGroup',
        'ec2:DeleteSecurityGroup',
        'ec2:RevokeSecurityGroupEgress',
        'ec2:RevokeSecurityGroupIngress',
      ],
    })
  }

  public static transform (): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:aws:transform/Serverless-2016-10-31')],
      actions: ['cloudformation:CreateChangeSet'],
    })
  }

  public static mq (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:mq:${AWS::Region}:${AWS::AccountId}:broker:' + nameSpace + '*'),
        Fn.sub('arn:aws:mq:${AWS::Region}:${AWS::AccountId}:configuration:' + nameSpace + '*'),
      ],
      actions: [
        'mq:*',
      ],
    })
  }

  public static iamRole (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:iam::${AWS::AccountId}:role/' + nameSpace + '*')],
      actions: ['iam:*'],
    })
  }

  public static lambda (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:' + nameSpace + '*'),
        Fn.sub('arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:layer:' + nameSpace + '*'),
      ],
      actions: ['lambda:*'],
    })
  }

  public static apiDomain (domainName: string): PolicyStatement {
    return new PolicyStatement({
      resources: [
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/domainnames'),
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/domainnames/${domainName}', { domainName }),
        Fn.sub('arn:aws:apigateway:${AWS::Region}::/domainnames/${domainName}/*', { domainName }),
      ],
      actions: [
        'apigateway:POST',
        'apigateway:GET',
        'apigateway:DELETE',
      ],
    })
  }

  public static s3 (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:s3:::' + nameSpace + '*')],
      actions: ['s3:*'],
    })
  }

  public static route53RecordSet (zone: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'route53:GetHostedZone',
        'route53:ChangeResourceRecordSets',
        'route53:GetChange',
        'route53:ListResourceRecordSets',
      ],
      resources: [
        `arn:aws:route53:::hostedzone/${zone}`,
        'arn:aws:route53:::change/*',
      ],
    })
  }

  public static ssm (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'ssm:*',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/' + nameSpace + '/*'),
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/esu/dockerhub/*'),
      ],
    })
  }

  public static secrets (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'secretsmanager:*',
      ],
      resources: [
        Fn.sub('arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:/all/' + nameSpace + '*'),
      ],
    })
  }

  public static dynamodb (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/' + nameSpace + '*')],
      actions: [
        'dynamodb:CreateBackup',
        'dynamodb:CreateTable',
        'dynamodb:UpdateTable',
        'dynamodb:DeleteTable',
        'dynamodb:UpdateTimeToLive',
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTimeToLive',
        'dynamodb:TagResource',
        'dynamodb:UntagResource',
        'dynamodb:ListTagsOfResource',
      ],
    })
  }

  public static logs (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'logs:*',
      ],
      resources: [
        Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:' + nameSpace + '*'),
      ],
    })
  }

  public static ecs (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'ecs:*',
      ],
      resources: [
        Fn.sub('arn:aws:ecs:${AWS::Region}:${AWS::AccountId}:cluster/' + nameSpace + '*'),
        Fn.sub('arn:aws:ecs:${AWS::Region}:${AWS::AccountId}:service/' + nameSpace + '*'),
      ],
    })
  }

  public static events (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'events:*',
      ],
      resources: [
        Fn.sub('arn:aws:events:${AWS::Region}:${AWS::AccountId}:rule/' + nameSpace + '*'),
      ],
    })
  }

  public static cloudwatch (nameSpace: string): PolicyStatement {
    return new PolicyStatement({
      actions: [
        'cloudwatch:*',
      ],
      resources: [
        Fn.sub('arn:aws:cloudwatch:${AWS::Region}:${AWS::AccountId}:alarm:' + nameSpace + '*'),
      ],
    })
  }
}

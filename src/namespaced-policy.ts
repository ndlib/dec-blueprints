import { PolicyStatement } from '@aws-cdk/aws-iam'
import { Fn, Stack } from '@aws-cdk/core'

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
        'ec2:CreateSecurityGroup',
        'ec2:DescribeSecurityGroups',
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
        'elasticfilesystem:ListTagsForResource',
        'elasticfilesystem:UntagResource',
        'elasticfilesystem:TagResource',
        'elasticfilesystem:DescribeFileSystemPolicy',
        'elasticfilesystem:PutLifecycleConfiguration',
      ]
    }
    if (actionOptions.includes(GlobalActions.AutoScaling)) {
      actions.push('application-autoscaling:*')
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
  public static securityGroups (): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:ec2:${AWS::Region}:${AWS::AccountId}:security-group/*')],
      actions: [
        'ec2:createTags',
        'ec2:AuthorizeSecurityGroupEgress',
        'ec2:AuthorizeSecurityGroupIngress',
        'ec2:DeleteSecurityGroup',
        'ec2:RevokeSecurityGroupEgress',
        'ec2:RevokeSecurityGroupIngress',
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

  public static transform (): PolicyStatement {
    return new PolicyStatement({
      resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:aws:transform/Serverless-2016-10-31')],
      actions: ['cloudformation:CreateChangeSet'],
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
}

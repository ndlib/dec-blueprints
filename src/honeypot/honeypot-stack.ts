// import * as cdk from '@aws-cdk/core'
// import { HttpsAlb } from '@ndlib/ndlib-cdk'
// import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets'
// import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
// import { SharedServiceStackProps } from '../shared-stack-props'
// import { FoundationStack } from '../foundation-stack'
// import { CustomEnvironment } from '../custom-environment'
// import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
// import { SubnetType, Vpc } from '@aws-cdk/aws-ec2'
// import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
// import ecs = require('@aws-cdk/aws-ecs')
// import ssm = require('@aws-cdk/aws-ssm')
// import fs = require('fs')
// import { AssetHelpers } from '../asset-helpers'
import * as cdk from '@aws-cdk/core'
import {
  AwsLogDriver,
  Cluster,
  FargateService,
  FargateTaskDefinition,
  Secret,
} from '@aws-cdk/aws-ecs'
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from '@aws-cdk/aws-ec2'
import { ApplicationListenerRule, ApplicationProtocol, ApplicationTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { CustomEnvironment } from '../custom-environment'
import { SharedServiceStackProps } from '../shared-stack-props'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { AssetHelpers } from '../asset-helpers'

export interface HoneypotStackProps extends SharedServiceStackProps {
  readonly env: CustomEnvironment,
  readonly appDirectory: string
  readonly hostnamePrefix: string
}

export class HoneypotStack extends cdk.Stack {
  public readonly hostname: string

  constructor (scope: cdk.Construct, id: string, props: HoneypotStackProps) {
    super(scope, id, props)

    const loadBalancer = new HttpsAlb(this, 'loadBalancer', {
      internetFacing: true,
      vpc: props.foundationStack.vpc,
      certificateArns: [props.foundationStack.certificate.certificateArn],
    })

    const appSecurityGroup = new SecurityGroup(this, 'AppSecurityGroup', {
      vpc: props.foundationStack.vpc,
      allowAllOutbound: true,
    })

    appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'allow all inbound on 80')

    const logging = new AwsLogDriver({
      streamPrefix: `${this.stackName}-Task`,
      logGroup: new LogGroup(this, `${this.stackName}`, {
        retention: RetentionDays.ONE_WEEK,
      }),
    })

    const secretsHelper = (task: string, key: string) => {
      const parameter = StringParameter.fromSecureStringParameterAttributes(this, `${task}${key}`, {
        parameterName: `/all/${this.stackName}/${key}`,
        version: 1, // This doesn't seem to matter in the context of ECS task definitions
      })
      return Secret.fromSsmParameter(parameter)
    }

    const containerImage = AssetHelpers.containerFromDockerfile(this, 'DockerImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile',
    })
    const appTaskDefinition = new FargateTaskDefinition(this, 'RailsTaskDefinition')

    const container = appTaskDefinition.addContainer('ruby24', {
      image: containerImage,
      command: ['bash', '/usr/bin/docker-entrypoint.sh'],
      essential: true,
      logging,
      secrets: {
        SECRET_KEY_BASE: secretsHelper('HoneypotService', 'secret_key_base'),
      },
      environment: {
        RAILS_RUN_ENV: 'production',
      },

    })
    container.addPortMappings({
      containerPort: 3019,
    })

    appTaskDefinition.defaultContainer = container

    const appService = new FargateService(this, 'AppService', {
      taskDefinition: appTaskDefinition,
      cluster: new Cluster(this, 'AppCluster', { vpc: props.foundationStack.vpc }),
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      desiredCount: 1,
      securityGroups: [appSecurityGroup],
    })

    appTaskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: [
        'ssm:Get',
      ],
      resources: [
        cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/${this.stackName}/*`),
      ],
    }))

    const loadBalancerTargetGroup = new ApplicationTargetGroup(this, 'ApplicationTargetGroup', {
      healthCheck: {
        enabled: true,
        path: '/health',
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
      },
      vpc: props.foundationStack.vpc,
      protocol: ApplicationProtocol.HTTP,
      targets: [appService],
    })

    new ApplicationListenerRule(this, 'ApplicationListenerRule', { // eslint-disable-line no-new
      listener: loadBalancer.defaultListener,
      priority: 1,
      pathPattern: '*',
      hostHeader: `${props.hostnamePrefix}.` + cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`),
      targetGroups: [loadBalancerTargetGroup],
    })
  }
}

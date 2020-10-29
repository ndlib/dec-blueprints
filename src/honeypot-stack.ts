import * as cdk from '@aws-cdk/core'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { DockerImageAsset } from '@aws-cdk/aws-ecr-assets'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { SharedServiceStackProps } from './shared-stack-props'
import { FoundationStack } from './foundation-stack'
import { CustomEnvironment } from './custom-environment'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { SubnetType, Vpc } from '@aws-cdk/aws-ec2'
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
import ecs = require('@aws-cdk/aws-ecs')
import ssm = require('@aws-cdk/aws-ssm')

export interface HoneypotStackProps extends SharedServiceStackProps {
  readonly hostnamePrefix: string,
  readonly env: CustomEnvironment
  readonly foundationStack: FoundationStack
}
export class HoneypotStack extends cdk.Stack {
  public readonly hostname: string

  constructor (scope: cdk.Construct, id: string, props: HoneypotStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
    if (props.env.name === 'prod') {
      this.hostname = `${props.hostnamePrefix || this.stackName}`
    } else {
      this.hostname = `${props.hostnamePrefix || this.stackName}` + `-${props.env.name}`
    }

    // Networking
    const vpcId = cdk.Fn.importValue(`${props.env.networkStackName}:VPCID`)
    const vpc = Vpc.fromVpcAttributes(this, 'ImportedVPC', {
      vpcId,
      availabilityZones: [
        // This technically doesn't matter in this context, since none of the resources in this app
        // require AZ for their cloud formations, only subnets. But in the interest of not creating
        // problems for future things that use this IVpc object, I'm recreating how AZs were defined
        // for the subnets in the network stack. In those stacks, we aren't exporting the AZs for
        // Subnet1|2 so this must match the way the subnets were created.
        cdk.Fn.select(0, cdk.Fn.getAzs()),
        cdk.Fn.select(1, cdk.Fn.getAzs()),
      ],
      publicSubnetIds: [
        cdk.Fn.importValue(`${props.env.networkStackName}:PublicSubnet1ID`),
        cdk.Fn.importValue(`${props.env.networkStackName}:PublicSubnet2ID`),
      ],
      privateSubnetIds: [
        cdk.Fn.importValue(`${props.env.networkStackName}:PrivateSubnet1ID`),
        cdk.Fn.importValue(`${props.env.networkStackName}:PrivateSubnet2ID`),
      ],
    })

    const alb = new HttpsAlb(this, 'PublicLoadBalancer', {
      vpc,
      certificateArns: [cdk.Fn.importValue(`${props.env.domainStackName}:ACMCertificateARN`)],
      internetFacing: false,
    })

    const secretsHelper = (task: string, key: string) => {
      const parameter = ssm.StringParameter.fromSecureStringParameterAttributes(this, `${task}${key}`, {
        parameterName: `/all/${this.hostname}/${key}`,
        version: 1, // This doesn't seem to matter in the context of ECS task definitions
      })
      return ecs.Secret.fromSsmParameter(parameter)
    }

    // ECS Service
    const cluster = new ecs.Cluster(this, 'FargateCluster', { vpc })

    const appTask = new ecs.TaskDefinition(this, 'AppTaskDefinition', {
      compatibility: ecs.Compatibility.FARGATE,
      family: `${this.hostname}-Service`,
      cpu: '2048',
      memoryMiB: '4096',
      networkMode: ecs.NetworkMode.AWS_VPC,
    })

    const logs = new LogGroup(this, 'SharedLogGroup', { retention: RetentionDays.TWO_WEEKS })

    const logging = ecs.AwsLogDriver.awsLogs({
      logGroup: logs,
      streamPrefix: `${this.hostname}-Task`,
    })

    // Add Container
    const containerImage = new DockerImageAsset(this, 'DockerImageAsset', {
      directory: '../honeypot',
      file: 'docker/Dockerfile',
    })

    const container = appTask.addContainer('ruby24', {
      image: ecs.ContainerImage.fromDockerImageAsset(containerImage),
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

    // Define default container for the task before adding the service to the targetGroup,
    // otherwise CDK will try to create SecurityGroups for all ports on all containers
    appTask.defaultContainer = container

    const appService = new ecs.FargateService(this, 'AppService', {
      taskDefinition: appTask,
      cluster,
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      desiredCount: 1,
    })

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      healthCheck: {
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        port: '3019',
      },
      deregistrationDelay: cdk.Duration.seconds(60),
      targetType: elbv2.TargetType.IP,
      port: 3019,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc,
      targets: [appService],
    })

    const domainNameImport = cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`)
    const elbv2Applistener = new elbv2.ApplicationListenerRule(this, 'ECSServiceRule2', {
      targetGroups: [targetGroup],
      pathPattern: '*',
      hostHeader: `${props.hostnamePrefix}.${domainNameImport}`,
      listener: alb.defaultListener,
      priority: 1,
    })

    if (props.env.createDns) {
      const cnameRecord = new CnameRecord(this, 'ServiceCNAME', {
        recordName: props.hostnamePrefix,
        domainName: alb.loadBalancerDnsName,
        zone: HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
          hostedZoneId: cdk.Fn.importValue(`${props.env.domainStackName}:Zone`),
          zoneName: domainNameImport,
        }),
        ttl: cdk.Duration.minutes(15),
      })
    }
  }
}

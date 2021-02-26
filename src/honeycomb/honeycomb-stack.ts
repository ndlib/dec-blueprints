import { SharedServiceStackProps } from '../shared-stack-props'
import { SecurityGroup } from '@aws-cdk/aws-ec2'
import { FoundationStack } from '../foundation-stack'
import { Construct, RemovalPolicy, Stack } from '@aws-cdk/core'
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { CustomEnvironment } from '../custom-environment'
import { SolrConstruct } from './solr-construct'
import { RabbitMqConstruct } from './rabbitmq-construct'
import { RailsConstruct } from './rails-construct'
import { HoneypotStack } from '../honeypot/honeypot-stack'
import { BuzzStack } from '../buzz/buzz-stack'
import { BeehiveStack } from '../beehive-stack'

export interface HoneycombStackProps extends SharedServiceStackProps {
  /**
   * The environment to deploy to
   */
  readonly env: CustomEnvironment

  /**
   * The directory containing the Honeycomb application source
   */
  readonly appDirectory: string

  /**
   * The foundation to build this stack on top of
   */
  readonly foundationStack: FoundationStack

  readonly honeypotStack: HoneypotStack
  readonly buzzStack: BuzzStack
  readonly beehiveStack: BeehiveStack

  /**
   * Hostname to use when adding to the public facing load balancer and dns
   */
  readonly hostnamePrefix: string
}

export class HoneycombStack extends Stack {
  constructor (scope: Construct, id: string, props: HoneycombStackProps) {
    super(scope, id, props)

    const fileSystem = new FileSystem(this, 'FileSystem', {
      vpc: props.foundationStack.vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
      encrypted: true,
    })

    const appSecurityGroup = new SecurityGroup(this, 'appSecurityGroup', {
      vpc: props.foundationStack.vpc,
      allowAllOutbound: true,
    })

    const solr = new SolrConstruct(this, 'Solr', {
      env: props.env,
      appDirectory: props.appDirectory,
      vpc: props.foundationStack.vpc,
      cluster: props.foundationStack.cluster,
      logs: props.foundationStack.logs,
      privateNamespace: props.foundationStack.privateNamespace,
      fileSystem,
    })

    const rabbitMq = new RabbitMqConstruct(this, 'RabbitMq', {
      env: props.env,
      vpc: props.foundationStack.vpc,
      appSecurityGroup,
      brokerName: `${this.stackName}-private-rabbitmq`,
    })

    const rails = new RailsConstruct(this, 'Rails', {
      env: props.env,
      vpc: props.foundationStack.vpc,
      cluster: props.foundationStack.cluster,
      logs: props.foundationStack.logs,
      privateNamespace: props.foundationStack.privateNamespace,
      publicLoadBalancer: props.foundationStack.publicLoadBalancer,
      appDirectory: props.appDirectory,
      hostnamePrefix: props.hostnamePrefix,
      appSecurityGroup,
      databaseSecurityGroup: props.foundationStack.databaseSecurityGroup,
      fileSystem,
      solr,
      rabbitMq,
      honeypot: props.honeypotStack,
      buzz: props.buzzStack,
      beehive: props.beehiveStack,
      mediaBucket: props.foundationStack.mediaBucket,
    })
  }
}

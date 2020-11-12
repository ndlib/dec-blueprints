import { Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { Construct, Duration, Fn, Stack } from '@aws-cdk/core'
import { CfnBroker } from '@aws-cdk/aws-amazonmq'
import { IMetric, MathExpression, Metric } from '@aws-cdk/aws-cloudwatch'
import { CustomEnvironment } from '../custom-environment'

export interface RabbitMqConstructProps {
  /**
   * The environment to deploy to
   */
  readonly env: CustomEnvironment

  /**
   * The Vpc to create the service in
   */
  readonly vpc: Vpc

  /**
   * Security group to allow incoming connections to the MQ
   */
  readonly appSecurityGroup: SecurityGroup

  /**
   * Name for the broker
   */
  readonly brokerName: string
}

export class RabbitMqConstruct extends Construct {
  readonly secret: Secret
  readonly hostname: string
  readonly scaleMetric: IMetric

  constructor (scope: Construct, id: string, props: RabbitMqConstructProps) {
    super(scope, id)
    const stackName = Stack.of(this).stackName

    const mqSecurityGroup = new SecurityGroup(this, 'mqSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    })
    mqSecurityGroup.addIngressRule(props.appSecurityGroup, Port.tcp(5671))
    this.secret = new Secret(this, 'RabbitMqSecret', {
      secretName: `/all/${stackName}/secrets/rabbitmq`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ login: 'honeycomb' }),
        generateStringKey: 'password',
        excludePunctuation: true, // Honeycomb is configured to use the pw in the uri, punctuation breaks that
        excludeCharacters: ', :=', // Specific to rabbitmq
      },
    })
    const rabbitMq = new CfnBroker(this, 'RabbitMq', {
      autoMinorVersionUpgrade: true,
      brokerName: props.brokerName,
      deploymentMode: 'SINGLE_INSTANCE',
      engineType: 'RABBITMQ',
      engineVersion: '3.8.6',
      hostInstanceType: 'mq.t3.micro',
      publiclyAccessible: false,
      users: [{
        username: this.secret.secretValueFromJson('login').toString(),
        password: this.secret.secretValueFromJson('password').toString(),
      }],
      securityGroups: [mqSecurityGroup.securityGroupId],
      subnetIds: [Fn.importValue(`${props.env.networkStackName}:PrivateSubnet1ID`)],
    })
    // attrAmqpEndpoints is of the form:
    //   [amqps://b-4aada85d-a80c-4be0-9d30-e344a01b921e-1.mq.us-east-1.amazonaws.com:5671]
    // But the app expects something like
    //   b-4aada85d-a80c-4be0-9d30-e344a01b921e-1.mq.us-east-1.amazonaws.com:5671
    // for the RABBIT_HOST env. This does some string manipulation to extract that.
    const rabbitUrl = Fn.select(0, rabbitMq.attrAmqpEndpoints)
    this.hostname = Fn.select(2, Fn.split('/', rabbitUrl))

    // Technically we can use sum here with a 1 minute period
    // since it reports once per minute, but using max in case
    // we change the period.
    const period = Duration.minutes(1)
    const statistic = 'Maximum'

    const imageJobsMetric = new Metric({
      namespace: 'AWS/AmazonMQ',
      metricName: 'MessageCount',
      dimensions: {
        Broker: rabbitMq.brokerName,
        VirtualHost: '/',
        Queue: 'honeypot_images',
      },
      statistic,
      period,
    })
    const imageRetryJobsMetric = new Metric({
      namespace: 'AWS/AmazonMQ',
      metricName: 'MessageCount',
      dimensions: {
        Broker: rabbitMq.brokerName,
        VirtualHost: '/',
        Queue: 'honeypot_images-retry',
      },
      statistic,
      period,
    })
    this.scaleMetric = new MathExpression({
      expression: 'imageJobsMetric + imageRetryJobsMetric',
      usingMetrics: { imageRetryJobsMetric, imageJobsMetric },
      period,
    })
  }
}

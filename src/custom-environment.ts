import { ConstructNode, Environment } from '@aws-cdk/core'
import { getRequiredContext } from './context-helpers'

export class CustomEnvironment implements Environment {
  readonly account: string
  readonly region: string

  /**
   * Name of the environment
   */
  readonly name: string

  /**
   * If true, service stacks will create Route53 recordsets
   * for their services
   */
  readonly createDns: boolean

  /**
   * The base subdomain that should be used for all services
   */
  readonly domainName: string

  /**
   * The name of the domain stack that should be used to lookup an SSL Certificate
   */

  readonly domainStackName: string

  /**
   * The name of the network stack that has exports for the current VPCID and SubnetIDs
   */

  readonly networkStackName: string

  /**
   * If true, the app will find an existing zone by the domainName given.
   * If false, the app will create one.
   */
  readonly useExistingDnsZone: boolean

  /**
   * The notification stack name to connect CodePipeline approvals to
   */
  readonly slackNotifyStackName: string

  /**
   * The email address to send CodePipeline status changes
   */
  readonly notificationReceivers: string

  /**
   * If true, will create Webhooks in CodePipeline
   * If false, will use polling in CodePipeline
   */
  readonly createGithubWebhooks: boolean

  /**
   * Email address to send SLO and other alarms to
   */
  readonly alarmsEmail: string

  static fromContext = (node: ConstructNode, name: string): CustomEnvironment => {
    const contextEnv = getRequiredContext(node, 'environments')[name]
    if (contextEnv === undefined || contextEnv === null) {
      throw new Error(`Context key 'environments.${name}' is required.`)
    }
    contextEnv.name = name
    return contextEnv
  }
}

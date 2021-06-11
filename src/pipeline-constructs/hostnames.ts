import { CustomEnvironment } from '../custom-environment'

export class PipelineHostnames {
  /**
   * The prefix that will be used for the test host, ex: myprefix-test
   */
  readonly testHostnamePrefix: string

  /**
   * The prefix that will be used for the production host, ex: myprefix
   */
  readonly prodHostnamePrefix: string

  /**
   * The FQDN of the test host, ex: myprefix-test.mydomain.com
   */
  readonly testHostname: string

  /**
   * The FQDN of the production host, ex: myprefix.mydomain.com
   */
  readonly prodHostname: string

  /**
   * Encapsulates the way we create hostnames from a prefix for test and prod
   * stacks in a pipeline.
   *
   * @param hostnamePrefix The hostname prefix to use when constructing FQDN.
   * @param env The environment to import the domain name from.
   */
  constructor (hostnamePrefix: string, env: CustomEnvironment) {
    this.testHostnamePrefix = `${hostnamePrefix}-test`
    this.prodHostnamePrefix = hostnamePrefix
    this.testHostname = `${this.testHostnamePrefix}.${env.domainName}`
    this.prodHostname = `${this.prodHostnamePrefix}.${env.domainName}`
  }
}

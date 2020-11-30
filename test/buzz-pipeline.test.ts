import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import helpers = require('../test/helpers')

describe('CodeBuild actions', () => {
  beforeEach(() => {
    helpers.mockDockerCredentials()
  })
  const stack = () => {
    const app = new cdk.App()
    // WHEN
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      oauthTokenPath: '/path/to/oauth',
      dockerCredentialsPath: '/all/dockerhub/credentials',
    }
    const hostnamePrefix = 'buzz-test'
    const buzzContext = getContextByNamespace('buzz')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })

    return new BuzzPipelineStack(app, 'MyBuzzPipelineStack', {
      env,
      foundationStack,
      hostnamePrefix,
      ...buzzContext,
      namespace: 'testNamespace',
      ssmPrefix: 'ssmPrefix',
      appSourceArtifact: 'testAppArtifact',
      migrateSecurityGroup: 'sg-123456',
    })
  }
  // Check for Desired resources with proper configurations

  test('creates codebuilds for DB migration', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        RegistryCredential: {
          Credential: '/path/to/credentials',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
    }))
  })

  //   test('puts proper ACM certificate on load balancer', () => {
  //     const newStack = stack()
  //     expectCDK(newStack).to(haveResource('AWS::ElasticLoadBalancingV2::Listener', {
  //       Certificates: [
  //         {
  //           CertificateArn: {
  //             'Fn::ImportValue': 'test-edu-domain:ACMCertificateARN',
  //           },
  //         },
  //       ],
  //     }))
  //   })

  //   test('creates ECS Service with proper containers ', () => {
  //     const newStack = stack()
  //     expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
  //       LoadBalancers: [
  //         {
  //           ContainerName: 'RailsContainer',
  //         },
  //       ],
  //     }))
  //   })

  //   test('creates ELB Listener with proper header', () => {
  //     const newStack = stack()
  //     expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
  //       Conditions: [
  //         {
  //           Field: 'host-header',
  //           Values: [
  //             {
  //               'Fn::Join': [
  //                 '',
  //                 [
  //                   'buzz-test.',
  //                   {
  //                     'Fn::ImportValue': 'test-edu-domain:DomainName',
  //                   },
  //                 ],
  //               ],
  //             },
  //           ],
  //         },
  //       ],
  //     }))
  //   })
  // })

  // describe('production infrastructure', () => {
  //   const stack = () => {
  //     const app = new cdk.App()
  //     // WHEN
  //     const env = {
  //       name: 'prod',
  //       domainName: 'test.edu',
  //       domainStackName: 'test-edu-domain',
  //       networkStackName: 'test-network',
  //       region: 'test-region',
  //       account: 'test-account',
  //       createDns: true,
  //       useVpcId: '123456',
  //       slackNotifyStackName: 'slack-test',
  //       createGithubWebhooks: false,
  //       useExistingDnsZone: false,
  //       notificationReceivers: 'test@test.edu',
  //       alarmsEmail: 'test@test.edu',
  //       oauthTokenPath: '/path/to/oauth',
  //     }
  //     const buzzContext = getContextByNamespace('buzz')
  //     const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
  //     return new BuzzPipelineStack(app, 'MyBuzzStack', {
  //       env,
  //       name: 'prod',
  //       hostnamePrefix: 'buzz',
  //       foundationStack,
  //       appDirectory: 'test/fixtures',
  //       ...buzzContext,
  //     })
  //   }

//   // Check for expected resources with desired configuration
//   test('creates ELB Listener with proper header', () => {
//     const newStack = stack()
//     expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
//       Conditions: [
//         {
//           Field: 'host-header',
//           Values: [
//             {
//               'Fn::Join': [
//                 '',
//                 [
//                   'buzz.',
//                   {
//                     'Fn::ImportValue': 'test-edu-domain:DomainName',
//                   },
//                 ],
//               ],
//             },
//           ],
//         },
//       ],
//     }))
//   })
})

import { App, Stack, SecretValue } from '@aws-cdk/core'
import { Artifact, Pipeline } from '@aws-cdk/aws-codepipeline'
import { CdkDeploy } from '../../src/pipeline-constructs/cdk-deploy'
import { expect as expectCDK, objectLike, haveResourceLike, arrayWith, encodedJson, Capture } from '@aws-cdk/assert'
import { BuildEnvironmentVariableType } from '@aws-cdk/aws-codebuild'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import getGiven from 'givens'
import { GitHubSource } from '../../src/pipeline-constructs/github-source'

interface lazyEvals {
  app: App
  stack: Stack
  subject: Stack
  infraSource: GitHubSource
  appSource: GitHubSource
  outputDeployArtifact: Artifact
  deploy: CdkDeploy
}
const lazyEval = getGiven<lazyEvals>()

describe('CDKPipelineDeploy', () => {
  lazyEval('infraSource', () => new GitHubSource(lazyEval.stack, 'InfraCode', {
    repo: 'infraRepo',
    owner: 'infraOwner',
    oauthToken: SecretValue.secretsManager('oauthTokenPath', { jsonField: 'oauth' }),
  }))
  lazyEval('appSource', () => new GitHubSource(lazyEval.stack, 'AppCode', {
    repo: 'appRepo',
    owner: 'appOwner',
    oauthToken: SecretValue.secretsManager('oauthTokenPath', { jsonField: 'oauth' }),
  }))
  lazyEval('outputDeployArtifact', () => new Artifact('outputDeployArtifact'))
  lazyEval('deploy', () => new CdkDeploy(lazyEval.stack, 'CDKPipelineDeploy', {
    dockerCredentials: Secret.fromSecretNameV2(lazyEval.stack, 'dockerCredentials', 'dockerhubCredentialsPath'),
    appSource: lazyEval.appSource,
    infraSource: lazyEval.infraSource,
    cdkDirectory: 'cdkDirectory',
    contextEnvName: 'contextEnvName',
    targetStack: 'targetStack',
    dependsOnStacks: ['dependsOnStack.A', 'dependsOnStack.B'],
    outputArtifact: lazyEval.outputDeployArtifact,
    namespace: 'namespace',
    additionalRuntimeEnvironments: {
      someRuntime: '9000.x',
    },
    additionalContext: {
      contextOverrideOne: 'contextOverrideOne',
      'contextOverride:Two': '/contextOverride/Two',
    },
    appBuildCommands: [
      'appBuildCommand one',
      'appBuildCommand two',
    ],
    postDeployCommands: [
      'postDeployCommand one',
      'postDeployCommand two',
    ],
    additionalEnvironmentVariables: {
      PLAIN_ENV_VAR: {
        value: 'plainEnvValue',
      },
      SECRET_ENV_VAR: {
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
        value: 'secretEnvPath:secretEnvKey',
      },
    },
  }))
  lazyEval('stack', () => new Stack(lazyEval.app, 'Stack'))
  lazyEval('subject', () => {
    const deploy = lazyEval.deploy
    return lazyEval.stack
  })

  test('allows overriding where to find the cdk project', () => {
    const installCommands = Capture.anyType()
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            install: objectLike({
              commands: installCommands.capture(),
            }),
            build: {
              commands: buildCommands.capture(),
            },
          }),
        })),
      },
    }))

    // To test this we need to make sure we move into the cdkDirectory both before
    // installing the cdk modules in the install phase, and before running deploy
    // commands in the build step
    expect(installCommands.capturedValue[0]).toEqual('cd $CODEBUILD_SRC_DIR/cdkDirectory')
    expect(installCommands.capturedValue).toContainEqual(expect.stringContaining('npm install'))
    expect(buildCommands.capturedValue[0]).toEqual('cd $CODEBUILD_SRC_DIR/cdkDirectory')
    expect(buildCommands.capturedValue).toContainEqual(expect.stringContaining('cdk deploy '))
  })

  test('uses the cdk installed by the package modules', () => {
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            build: objectLike({
              commands: buildCommands.capture(),
            }),
          }),
        })),
      },
    }))
    expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/^npm run cdk deploy/))
  })

  test('runs any build scripts before staging the files and deploying', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            pre_build: {
              commands: [
                'mkdir -p /var/empty',
                'cd $CODEBUILD_SRC_DIR_AppCode',
                'appBuildCommand one',
                'appBuildCommand two',
              ],
            },
          }),
        })),
      },
    }))
  })

  test('runs any given post deploy commands', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            post_build: {
              commands: [
                'postDeployCommand one',
                'postDeployCommand two',
              ],
            },
          }),
        })),
      },
    }))
  })

  test('adds additional installs to the buildspec for each kvp in additionalRuntimeEnvironments', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            install: objectLike({
              'runtime-versions': {
                nodejs: '12.x',
                someRuntime: '9000.x',
              },
            }),
          }),
        })),
      },
    }))
  })

  test('authenticates with Dockerhub using the given path for credentials before deploying to assist with pulling for any container builds', () => {
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        EnvironmentVariables: [
          {
            Name: 'DOCKERHUB_USERNAME',
            Type: 'SECRETS_MANAGER',
            Value: 'dockerhubCredentialsPath:username',
          },
          {
            Name: 'DOCKERHUB_PASSWORD',
            Type: 'SECRETS_MANAGER',
            Value: 'dockerhubCredentialsPath:password',
          },
        ],
      },
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            build: objectLike({
              commands: buildCommands.capture(),
            }),
          }),
        })),
      },
    }))
    // Unfortunately this doesn't test the order. May need to revisit
    expect(buildCommands.capturedValue).toEqual(expect.arrayContaining([
      'echo $DOCKERHUB_PASSWORD | docker login --username $DOCKERHUB_USERNAME --password-stdin',
      expect.stringContaining('cdk deploy'),
    ]))
  })

  test('adds any additional environment variables to the CodeBuild', () => {
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        EnvironmentVariables: arrayWith(
          {
            Name: 'PLAIN_ENV_VAR',
            Type: 'PLAINTEXT',
            Value: 'plainEnvValue',
          },
          {
            Name: 'SECRET_ENV_VAR',
            Type: 'SECRETS_MANAGER',
            Value: 'secretEnvPath:secretEnvKey',
          },
        ),
      },
    }))
  })

  describe('deploy command', () => {
    test('specifies the target stack exclusively', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: objectLike({
                commands: buildCommands.capture(),
              }),
            }),
          })),
        },
      }))
      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/cdk deploy.* --exclusively/))
    })

    test('adds the correct stack namespace override', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: objectLike({
                commands: buildCommands.capture(),
              }),
            }),
          })),
        },
      }))
      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/cdk deploy.* -c "namespace=namespace"/))
    })

    test('adds the correct env override', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: objectLike({
                commands: buildCommands.capture(),
              }),
            }),
          })),
        },
      }))
      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/cdk deploy.* -c "env=contextEnvName"/))
    })

    test('adds any additional context overrides', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: objectLike({
                commands: buildCommands.capture(),
              }),
            }),
          })),
        },
      }))
      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/cdk deploy.* -c "contextOverrideOne=contextOverrideOne" -c "contextOverride:Two=\/contextOverride\/Two"/))
    })
  })

  describe('gives the project role permission to', () => {
    // Properties that uniquely identify the policy we're testing in this describe block
    const policyIdentifiers = {
      PolicyName: 'CDKPipelineDeployProjectRoleDefaultPolicy23482FCB',
      Roles: [{ Ref: 'CDKPipelineDeployProjectRole49620AD9' }],
    }
    test('modify the target stack', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::IAM::Policy', {
        ...policyIdentifiers,
        PolicyDocument: {
          Statement: arrayWith({
            Action: [
              'cloudformation:CreateChangeSet',
              'cloudformation:DeleteStack',
              'cloudformation:DeleteChangeSet',
              'cloudformation:DescribeChangeSet',
              'cloudformation:DescribeStacks',
              'cloudformation:DescribeStackEvents',
              'cloudformation:ExecuteChangeSet',
              'cloudformation:GetTemplate',
            ],
            Effect: 'Allow',
            Resource: arrayWith({
              'Fn::Sub': 'arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/targetStack/*',
            }),
          }),
        },
      }))
    })

    test('modify any dependent stacks', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::IAM::Policy', {
        ...policyIdentifiers,
        PolicyDocument: {
          Statement: arrayWith({
            Action: [
              'cloudformation:CreateChangeSet',
              'cloudformation:DeleteStack',
              'cloudformation:DeleteChangeSet',
              'cloudformation:DescribeChangeSet',
              'cloudformation:DescribeStacks',
              'cloudformation:DescribeStackEvents',
              'cloudformation:ExecuteChangeSet',
              'cloudformation:GetTemplate',
            ],
            Effect: 'Allow',
            Resource: arrayWith(
              {
                'Fn::Sub': 'arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/dependsOnStack.A/*',
              },
              {
                'Fn::Sub': 'arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/dependsOnStack.B/*',
              },
            ),
          }),
        },
      }))
    })

    test('read logs when generating output for failed events', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::IAM::Policy', {
        ...policyIdentifiers,
        PolicyDocument: {
          Statement: arrayWith({
            Action: 'logs:DescribeLogGroups',
            Effect: 'Allow',
            Resource: '*',
          }),
        },
      }))
    })

    test('read CDK bootstrap stack/bucket', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::IAM::Policy', {
        ...policyIdentifiers,
        PolicyDocument: {
          Statement: arrayWith({
            Effect: 'Allow',
            Action: [
              's3:ListBucket',
              's3:GetObject',
              's3:PutObject',
              's3:ListBucketVersions',
              's3:GetBucketLocation',
              's3:GetBucketPolicy',
            ],
            Resource: 'arn:aws:s3:::cdktoolkit-stagingbucket-*',
          }),
        },
      }))
    })
  })

  describe('when the deploy action is added to a pipeline', () => {
    // Redefine the subject to also add a pipeline that uses the deploy.action
    lazyEval('subject', () => {
      const pipeline = new Pipeline(lazyEval.stack, 'Pipeline', {
        stages: [
          {
            stageName: 'SourceStage',
            actions: [
              lazyEval.appSource.action,
              lazyEval.infraSource.action,
            ],
          },
          {
            stageName: 'DeployStage',
            actions: [lazyEval.deploy.action],
          },
        ],
      })
      return lazyEval.stack
    })

    test('specifies the infrastructure code as the primary input', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
        Stages: arrayWith(
          objectLike({
            Actions: [
              objectLike({
                Configuration: objectLike({
                  ProjectName: {
                    Ref: 'CDKPipelineDeployProject6F55B5D6',
                  },
                  PrimarySource: 'InfraCode',
                }),
                InputArtifacts: arrayWith({
                  Name: 'InfraCode',
                }),
                Name: 'Deploy',
              }),
            ],
            Name: 'DeployStage',
          }),
        ),
      }))
    })

    test('adds the application code as extra inputs', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
        Stages: arrayWith(
          objectLike({
            Actions: [
              objectLike({
                InputArtifacts: arrayWith({
                  Name: 'AppCode',
                }),
                Name: 'Deploy',
              }),
            ],
            Name: 'DeployStage',
          }),
        ),
      }))
    })

    test('outputs files correctly to a given artifact', () => {
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
        Stages: arrayWith(
          objectLike({
            Actions: [
              objectLike({
                OutputArtifacts: arrayWith({
                  Name: 'outputDeployArtifact',
                }),
                Name: 'Deploy',
              }),
            ],
            Name: 'DeployStage',
          }),
        ),
      }))
    })
  })
})

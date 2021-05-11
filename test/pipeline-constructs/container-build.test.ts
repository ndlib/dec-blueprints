import { expect as expectCDK, objectLike, haveResourceLike, arrayWith, stringLike, haveResource, encodedJson, anything, Capture } from '@aws-cdk/assert'
import { App, SecretValue, Stack } from '@aws-cdk/core'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { Repository } from '@aws-cdk/aws-ecr'
import getGiven from 'givens'
import { ContainerBuild } from '../../src/pipeline-constructs/container-build'
import { GitHubSource } from '../../src/pipeline-constructs/github-source'

interface lazyEvals {
  app: App
  buildArgs: { [key: string]: string }
  dockerfile: string
  subject: Stack
}
const lazyEval = getGiven<lazyEvals>()

describe('CDKPipelineDeploy', () => {
  lazyEval('subject', () => {
    const stack = new Stack(lazyEval.app, 'TestStack')
    const build = new ContainerBuild(stack, 'TestBuild', {
      appSource: new GitHubSource(stack, 'AppCode', { oauthToken: SecretValue.secretsManager('test/githubOauthToken', { jsonField: 'oauth' }), owner: 'TestOwner', repo: 'TestRepo', branch: 'TestBranch' }),
      dockerCredentials: Secret.fromSecretNameV2(stack, 'dockerCredentials', 'test/dockerCredentials'),
      ecr: new Repository(stack, 'TestECR'),
      containerName: 'TestContainer',
      ecrNameContextOverride: 'Test:ecrNameContextOverride',
      ecrTagContextOverride: 'Test:ecrTagContextOverride',
      buildArgs: lazyEval.buildArgs,
      dockerfile: lazyEval.dockerfile,
    })
    return stack
  })

  test('builds and pushes to the REPO_URI and IMAGE_TAG that will be populated by the pipeline action', () => {
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
    expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/docker build.*-t \$REPO_URI:\$IMAGE_TAG/))
    expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/docker push \$REPO_URI:\$IMAGE_TAG/))
  })

  describe('when not given a dockerfile', () => {
    test('defaults to -f Dockerfile', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: {
                commands: buildCommands.capture(),
              },
            }),
          })),
        },
      }))

      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/docker build.*-f Dockerfile/))
    })
  })

  describe('when given a dockerfile', () => {
    lazyEval('dockerfile', () => 'TestDockerfile')

    test('adds the -f override', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: {
                commands: buildCommands.capture(),
              },
            }),
          })),
        },
      }))

      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/docker build.*-f TestDockerfile/))
    })
  })

  describe('when given build args', () => {
    lazyEval('buildArgs', () => ({ arg1: 'arg1Value', arg2: 'arg2Value' }))

    test('adds a --build-arg for each argument', () => {
      const buildCommands = Capture.anyType()
      expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
        Source: {
          BuildSpec: encodedJson(objectLike({
            phases: objectLike({
              build: {
                commands: buildCommands.capture(),
              },
            }),
          })),
        },
      }))

      expect(buildCommands.capturedValue).toContainEqual(expect.stringMatching(/docker build.*--build-arg "arg1=arg1Value" --build-arg "arg2=arg2Value"/))
    })
  })
})
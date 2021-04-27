import { BuildSpec, BuildEnvironmentVariable, BuildEnvironmentVariableType, LinuxBuildImage, PipelineProject, PipelineProjectProps } from '@aws-cdk/aws-codebuild'
import { Artifact } from '@aws-cdk/aws-codepipeline'
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { ISecret } from '@aws-cdk/aws-secretsmanager'
import { Construct, Fn } from '@aws-cdk/core'
import { GitHubSource } from './github-source'
import { ContainerBuild } from './container-build'

export interface CdkDeployProps extends PipelineProjectProps {
  /**
   * The name of the stack that this project will deploy to. Will add
   * permissions to create change sets on these stacks.
   */
  readonly targetStack: string;

  /**
   * The stack names that the target stack will depend on. Will add permissions
   * to also create change sets on these stacks. Note: This can be ignored
   * if using the cdk deploy --exclusively option.
   */
  readonly dependsOnStacks?: string[];

  /**
   * Infrastructure source artifact. Must include the cdk code
   */
  readonly infraSource: GitHubSource;

  /**
   * Application source artifact.
   */
  readonly appSource?: GitHubSource;

  /**
   * Optionally, if the pipeline has built the containers prior to the cdk deploy,
   * adding these builds here will add context overrides to the cdk deploy command
   * so that the stack can use the given built images instead of performing the
   * docker build at deploy time. Note: The stack must be coded to read these
   * overrides and use them when creating the container instead of building from
   * file. Context overrides will be emitted as follows:
   *   -c "containerName:ecrName=<ecr name from build>"
   *   -c "containerName:ecrTag=<tag from build>"
   */
  readonly containerBuilds?: ContainerBuild[];

  /**
   * Subdirectory of the infrastructure source where the cdk code can be found, without leading /
   * The action created will use infra source as primary input, so this should be a subdir of the
   * CODEBUILD_SRC_DIR environment variable
   */
  readonly cdkDirectory?: string;

  /**
   * Namespace to use for stack names etc
   */
  readonly namespace: string;

  /**
   * Any additional key value pairs to pass as additional --context overrides when deploying
   */
  readonly additionalContext?: { [key: string]: string };

  /**
   * The context env name to use when deploying the stack
   */
  readonly contextEnvName: string;

  /**
   * Any commands that should be run within the AppCode before deploying. A typical example
   * of this is any npm installs or other preparation for things like a lambda.
   */
  readonly appBuildCommands?: string[];

  /**
   * Any commands that should run after a successful deployment.
   */
  readonly postDeployCommands?: string[];

  /**
   * If passing artifacts to a future stage, this is the base directory for those output files
   */
  readonly outputDirectory?: string;

  /**
   * If passing artifacts to a future stage, this is the list of files to pass on
   */
  readonly outputFiles?: string[];

  /**
   * If passing artifacts to a future stage, this is the artifact to use as the output. By default, no output will be used
   */
  readonly outputArtifact?: Artifact;

  /**
   * The Secrets Manager secret to allow authenticated Docker logins
   */
   readonly dockerCredentials: ISecret

  /**
   * Any runtime environments needed in addition to the one needed for cdk itself (currently nodejs: '12.x')  e.g. `python: '3.8'`
   */
  readonly additionalRuntimeEnvironments?: { [key: string]: string };

  /**
   * Run order to use for this deploy action. Default is 1
   */
  readonly runOrder?: number
}

export class CdkDeploy extends Construct {
  public readonly project: PipelineProject
  public readonly action: CodeBuildAction

  /**
   * Convenience class for creating a PipelineProject and Action that will use cdk to deploy
   * the service stacks in this application. Primarily handles adding the necessary
   * permissions for cdk to make changes to the target stacks involved and adding context
   * overrides that are typical for our applications
   */
  constructor (scope: Construct, id: string, props: CdkDeployProps) {
    super(scope, id)

    let addtlContext = ''
    if (props.additionalContext !== undefined) {
      Object.entries(props.additionalContext).forEach((val) => {
        addtlContext += ` -c "${val[0]}=${val[1]}"`
      })
    }

    // Container builds will have interpolated codepipeline variables in them. Pipeline
    // variables must be passed as env in an action. This maps those values to env and
    // adds the context overrides
    const containerBuildsEnv = {} as { [key: string]: BuildEnvironmentVariable }
    if (props.containerBuilds !== undefined) {
      props.containerBuilds.forEach(build => {
        const envKey = `${build.containerName}_ECR_TAG`.toUpperCase()
        containerBuildsEnv[envKey] = { value: build.imageTag }
        addtlContext += ` -c "${build.ecrNameContextOverride}=${build.ecr.repositoryName}"`
        addtlContext += ` -c "${build.ecrTagContextOverride}=$${envKey}"`
      })
    }

    let appSourceDir = '$CODEBUILD_SRC_DIR'
    const extraInputs: Array<Artifact> = []
    if (props.appSource !== undefined) {
      extraInputs.push(props.appSource.artifact)
      appSourceDir = `$CODEBUILD_SRC_DIR_${props.appSource.artifact.artifactName}`
    }
    this.project = new PipelineProject(scope, `${id}Project`, {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_4_0,
        privileged: true,
      },
      environmentVariables: {
        DOCKERHUB_USERNAME: {
          type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: `${props.dockerCredentials.secretName}:username`,
        },
        DOCKERHUB_PASSWORD: {
          type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: `${props.dockerCredentials.secretName}:password`,
        },
      },
      buildSpec: BuildSpec.fromObject({
        artifacts: {
          'base-directory': props.outputDirectory,
          files: props.outputFiles || [],
        },
        phases: {
          install: {
            commands: [
              `cd $CODEBUILD_SRC_DIR/${props.cdkDirectory || ''}`,
              'npm install',
            ],
            'runtime-versions': {
              nodejs: '12.x',
              ...(props.additionalRuntimeEnvironments || []),
            },
          },
          pre_build: {
            commands: [
              `cd ${appSourceDir}`,
              ...(props.appBuildCommands || []),
            ],
          },
          build: {
            commands: [
              `cd $CODEBUILD_SRC_DIR/${props.cdkDirectory || ''}`,
              'echo $DOCKERHUB_PASSWORD | docker login --username $DOCKERHUB_USERNAME --password-stdin',
              `npm run cdk deploy -- ${props.targetStack} \
                --require-approval never --exclusively \
                -c "namespace=${props.namespace}" -c "env=${props.contextEnvName}" ${addtlContext}`,
            ],
          },
          post_build: {
            commands: props.postDeployCommands || [],
          },
        },
        version: '0.2',
      }),
      ...props,
    })

    // CDK will try to read logs when generating output for failed events
    this.project.addToRolePolicy(new PolicyStatement({
      actions: ['logs:DescribeLogGroups'],
      resources: ['*'],
    }))

    // Anytime cdk deploys a stack without --exclusively, it will try to also update the stacks it depends on.
    // So, we need to give the pipeline permissions to update the target stack and the stacks it depends on.
    this.project.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudformation:CreateChangeSet',
        'cloudformation:DeleteStack',
        'cloudformation:DeleteChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:GetTemplate',
      ],
      resources: [props.targetStack, ...props.dependsOnStacks ?? []].map(s => Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + s + '/*')),
    }))

    // Add permissions to read CDK bootstrap stack/bucket
    this.project.addToRolePolicy(new PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*')],
    }))
    this.project.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:ListBucket',
        's3:GetObject',
        's3:PutObject',
        's3:ListBucketVersions',
        's3:GetBucketLocation',
        's3:GetBucketPolicy',
      ],
      resources: ['arn:aws:s3:::cdktoolkit-stagingbucket-*'],
    }))

    this.action = new CodeBuildAction({
      actionName: 'Deploy',
      input: props.infraSource.artifact,
      extraInputs: extraInputs,
      project: this.project,
      runOrder: props.runOrder ?? 1,
      outputs: (props.outputArtifact ? [props.outputArtifact] : []),
      environmentVariables: {
        ...containerBuildsEnv,
        ...props.environmentVariables,
      },
    })
  }
}

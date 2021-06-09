import { Construct } from '@aws-cdk/core'
import { BuildEnvironmentVariable, BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { SlackApproval, PipelineNotifications, ArtifactBucket } from '@ndlib/ndlib-cdk'
import { CodeBuildAction, ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions'
import { Topic } from '@aws-cdk/aws-sns'
import { Pipeline, PipelineProps } from '@aws-cdk/aws-codepipeline'
import { ISecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import { Repository } from '@aws-cdk/aws-ecr'
import { CdkDeploy } from './cdk-deploy'
import { CustomEnvironment } from '../custom-environment'
import { DockerhubImage } from '../dockerhub-image'
import { PipelineRailsMigration } from './rails-migration'
import { GitHubSource, GitHubSourceProps } from './github-source'
import { ContainerBuild } from './container-build'

export interface RailsPipelineStageProps {
  /**
   * The VPC to use for any containers that need to perform a Rails migration
   */
  readonly vpc: Vpc

  /**
   * The SG to use for any containers that need to perform a Rails migration
   */
  readonly databaseSecurityGroup: ISecurityGroup

  /**
   * Where to get Rails configuration from SSM to inject into the ENV when running
   * the migration. Expected keys within this path and what ENV they will be mapped
   * to are as follows:
   *   <configPath>/secrets/secret_key_base -> RAILS_SECRET_KEY_BASE
   *   <configPath>/database/host           -> DB_HOSTNAME
   *   <configPath>/database/database       -> DB_NAME
   *   <configPath>/database/username       -> DB_USERNAME
   *   <configPath>/database/password       -> DB_PASSWORD
   *   <configPath>/database/port           -> DB_PORT
   */
  readonly configPath: string

  /**
   * The hostname that will be deployed. Required to run smoke tests against
   */
  readonly hostname: string

  /**
   * The namespace to use when performing the cdk deploy at this stage
   */
  readonly namespace: string

  /**
   * The name of the stack to deploy when performing the cdk deploy at this stage
   */
  readonly stackname: string

  /**
   * A friendly name for this stage. Default: Test for test stage, and Production for the production stage
   */
  readonly stageName?: string

  /**
   * Any additional context that should be passed to cdk during the deploy at this stage
   */
  readonly additionalDeployContext?: { [key: string]: string }

  /**
   * An optional callback function to modify the deploy stage. Typically this should be used for
   * attaching any additional policies that the pipeline may need to successfuly deploy this application
   */
  readonly onDeployCreated?: (deploy: CdkDeploy, stage: RailsPipelineStageProps) => void
}

export interface RailsPipelineContainerProps {
  /**
   * A friendly name to use for this container. This will be used as part
   * of the tag name when pushing to ECR, and as the action name for builds
   */
  readonly containerName: string

  /**
   * The context key to provide to the cdk deploy to override the container source
   * behavior. The cdk code for this application must look for this override
   * to instruct it to use the image built by the pipeline instead of rebuilding
   * from source.
   */
  readonly ecrNameContextOverride: string

  /**
   * The context key to provide to the cdk deploy to override the container source
   * behavior. The cdk code for this application must look for this override
   * to instruct it to use the image built by the pipeline instead of rebuilding
   * from source.
   */
  readonly ecrTagContextOverride: string

  /**
   * The path to the dockerfile, relative to the root of the application source repo
   */
  readonly dockerfile: string

  /**
   * Tells the pipeline to additionally create a migration action that will run in parallel
   * to the deploy. Note: It is critical that the application will fail health checks
   * until all migrations are run. This should normally the case for Rails applications, but
   * you may want to explicitly change the /health route to fail in the application
   */
  readonly includeRailsMigration?: boolean

  /**
   * Any additional environment variables to use when running this application's
   * Rails migrations (excluding those that will be automatically mapped from the
   * ssm config path)
   */
  readonly migrationEnv?: { [key: string]: BuildEnvironmentVariable }

  /**
   * The entry point to use when running this application's migrations inside
   * the Rails container. If a relative path is given, it must be relative to
   * the WORKDIR defined by the Rails container. Default: ./rails_migrate.sh
   */
  readonly migrateEntryPoint?: string;

  readonly buildArgs?: { [key: string]: string };
}

export interface PipelineSource {
  /**
   * The application code repo owner
   */
   readonly owner: string

   /**
    * The application code repo name
    */
   readonly name: string

   /**
    * The application code branch to monitor for changes
    */
   readonly branch: string
}

export interface RailsPipelineProps extends PipelineProps {
  /**
   * The env that this pipeline should deploy to
   */
  readonly env: CustomEnvironment

  readonly appSource: GitHubSourceProps
  readonly infraSource: GitHubSourceProps

  /**
   * The namespace to use for the cdk deployments
   */
  readonly namespace: string

  /**
   * The path to the Dockerhub credentials to use in secrets manager
   */
  readonly dockerhubCredentialsPath: string

  /**
   * The owner to use for the cdk deployments
   */
  readonly owner: string

  /**
   * The contact to use for the cdk deployments
   */
  readonly contact: string

  /**
   * The repository to push to and pull from for the container images
   * associated with this application
   */
  readonly ecr: Repository

  /**
   * The bucket to use for artifacts associated with this pipeline
   */
  readonly artifactBucket: ArtifactBucket

  /**
   * A list of containers that should be built and deployed for this
   * application.
   */
  readonly containers: RailsPipelineContainerProps[]

  /**
   * The path to the newman collection to run in the smoke tests stage
   */
  readonly smokeTestPath: string

  /**
   * Properties to use for various actions within the Test stage
   */
  readonly testStage: RailsPipelineStageProps

  /**
   * Properties to use for various actions within the Production stage
   */
  readonly prodStage: RailsPipelineStageProps
}

export class RailsPipeline extends Construct {
  /**
   * A reference to the generated Pipeline
   */
  readonly pipeline: Pipeline

  constructor (scope: Construct, id: string, props: RailsPipelineProps) {
    super(scope, id)

    // Source Actions
    const appSource = new GitHubSource(this, 'AppCode', props.appSource)
    const infraSource = new GitHubSource(this, 'InfraCode', props.infraSource)

    // Create builds and migrations from container builds
    const dockerCredentials = Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerhubCredentialsPath)
    const testMigrations: PipelineRailsMigration[] = []
    const prodMigrations: PipelineRailsMigration[] = []
    const containerBuilds = props.containers.map(containerProps => {
      const build = new ContainerBuild(this, `${props.namespace}-${containerProps.containerName}Build`, {
        appSource,
        dockerCredentials,
        ecr: props.ecr,
        ...containerProps,
      })
      if (containerProps.includeRailsMigration ?? false) {
        testMigrations.push(new PipelineRailsMigration(this, `${props.namespace}-${containerProps.containerName}-MigrateTest`, {
          namespace: props.namespace,
          ecr: props.ecr,
          vpc: props.testStage.vpc,
          databaseSecurityGroup: props.testStage.databaseSecurityGroup,
          dockerCredentials,
          railsBuild: build,
          configPath: props.testStage.configPath,
          environmentVariables: containerProps.migrationEnv,
          migrateEntryPoint: containerProps.migrateEntryPoint,
        }))
        prodMigrations.push(new PipelineRailsMigration(this, `${props.namespace}-${containerProps.containerName}-MigrateProd`, {
          namespace: props.namespace,
          ecr: props.ecr,
          vpc: props.prodStage.vpc,
          databaseSecurityGroup: props.prodStage.databaseSecurityGroup,
          dockerCredentials,
          railsBuild: build,
          configPath: props.prodStage.configPath,
          environmentVariables: containerProps.migrationEnv,
          migrateEntryPoint: containerProps.migrateEntryPoint,
        }))
      }
      return build
    })

    // CDK Deploy Test
    const defaultContext = {
      owner: props.owner,
      contact: props.contact,
      infraDirectory: '$CODEBUILD_SRC_DIR',
      appDirectory: '$CODEBUILD_SRC_DIR_AppCode',
    }
    const testStage = { stageName: 'Test', ...props.testStage }
    const deployTest = new CdkDeploy(this, `${props.namespace}-DeployTest`, {
      contextEnvName: props.env.name,
      targetStack: props.testStage.stackname,
      containerBuilds,
      infraSource,
      appSource,
      dockerCredentials,
      namespace: props.testStage.namespace,
      additionalContext: {
        ...defaultContext,
        ...props.testStage.additionalDeployContext,
      },
    })
    props.testStage.onDeployCreated && props.testStage.onDeployCreated(deployTest, testStage)

    const smokeTestsProject = new PipelineProject(this, `${props.namespace}-SmokeTests`, {
      buildSpec: BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `newman run ${props.smokeTestPath} --ignore-redirects --env-var app-host=https://$TARGET_HOST`,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: DockerhubImage.fromNewman(this, 'SmokeTestsImage', 'dockerhubCredentialsPath'),
      },
    })
    const smokeTestsAction = new CodeBuildAction({
      input: appSource.artifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
      environmentVariables: {
        TARGET_HOST: { value: props.testStage.hostname },
      },
    })

    // CDK Deploy Prod
    const prodStage = { stageName: 'Production', ...props.prodStage }
    const deployProd = new CdkDeploy(this, `${props.namespace}-DeployProd`, {
      contextEnvName: props.env.name,
      targetStack: props.prodStage.stackname,
      containerBuilds,
      infraSource,
      appSource,
      dockerCredentials,
      namespace: props.prodStage.namespace,
      additionalContext: {
        ...defaultContext,
        ...props.prodStage.additionalDeployContext,
      },
    })
    props.prodStage.onDeployCreated && props.prodStage.onDeployCreated(deployProd, prodStage)

    const smokeTestsProd = new CodeBuildAction({
      input: appSource.artifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
      environmentVariables: {
        TARGET_HOST: { value: props.prodStage.hostname },
      },
    })

    // Approval
    const appRepoUrl = `https://github.com/${props.appSource.owner}/${props.appSource.repo}`
    const infraRepoUrl = `https://github.com/${props.infraSource.owner}/${props.infraSource.repo}`
    const approvalTopic = new Topic(this, 'ApprovalTopic')
    const approvalAction = new ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${appRepoUrl} has been deployed to https://${props.testStage.hostname} and is awaiting your approval. If you approve these changes, they will be deployed to https://${props.prodStage.hostname}.\n\n*Application Changes:*\n${appSource.variables.commitMessage}\n\nFor more details on the changes, see ${appRepoUrl}/commit/${appSource.variables.commitId}.\n\n*Infrastructure Changes:*\n${infraSource.variables.commitMessage}\n\nFor more details on the changes, see ${infraRepoUrl}/commit/${infraSource.variables.commitId}.`,
      notificationTopic: approvalTopic,
      externalEntityLink: `https://${props.testStage.hostname}`,
      runOrder: 99,
    })
    if (props.env.slackNotifyStackName !== undefined) {
      const slackApproval = new SlackApproval(this, 'SlackApproval', {
        approvalTopic,
        notifyStackName: props.env.slackNotifyStackName,
      })
    }

    // Pipeline
    this.pipeline = new Pipeline(this, 'DeploymentPipeline', {
      artifactBucket: props.artifactBucket,
      stages: [
        {
          actions: [appSource.action, infraSource.action],
          stageName: 'Source',
        },
        {
          actions: containerBuilds.map(build => build.action),
          stageName: 'Build',
        },
        {
          actions: [deployTest.action, ...testMigrations.map(migration => migration.action), smokeTestsAction, approvalAction],
          stageName: testStage.stageName,
        },
        {
          actions: [deployProd.action, ...prodMigrations.map(migration => migration.action), smokeTestsProd],
          stageName: prodStage.stageName,
        },
      ],
    })

    if (props.env.notificationReceivers) {
      const notifications = new PipelineNotifications(this, 'PipelineNotifications', {
        pipeline: this.pipeline,
        receivers: props.env.notificationReceivers,
      })
    }
  }
}

import { BuildSpec, BuildEnvironmentVariable, BuildEnvironmentVariableType, LinuxBuildImage, PipelineProject } from '@aws-cdk/aws-codebuild'
import { Peer, Port, ISecurityGroup, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import { ISecret } from '@aws-cdk/aws-secretsmanager'
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { Construct, Fn } from '@aws-cdk/core'
import { Repository } from '@aws-cdk/aws-ecr'
import { ContainerBuild } from './container-build'

export interface IPipelineRailsMigrationProps {

  /**
   * Application source artifact.
   */
  readonly railsBuild: ContainerBuild;

  /**
   * Namespace to use for stack names etc
   */
  readonly namespace: string;

  /**
   * The path to the Secrets Manager secret to allow authenticated Docker logins
   */
  readonly dockerCredentials: ISecret

  /**
   * The VPC network to place codebuild network interfaces
   */
  readonly vpc: Vpc;

  /**
   * The SG to use that will allow this Pipeline action to run rails migrations
   * against the target database
   */
  readonly databaseSecurityGroup: ISecurityGroup;

  /**
   * The ECR to pull the Rails image from
   */
  readonly ecr: Repository;

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
  readonly configPath: string;

  /**
   * Any additional environment variables to use when running this application's
   * Rails migrations (excluding those that will be automatically mapped from the
   * ssm config path)
   */
  readonly environmentVariables?: { [key: string]: BuildEnvironmentVariable };

  /**
   * The entry point to use when running this application's migrations inside
   * the Rails container. If a relative path is given, it must be relative to
   * the WORKDIR defined by the Rails container. Default: ./rails_migrate.sh
   */
  readonly migrateEntryPoint?: string;
}

export class PipelineRailsMigration extends Construct {
  /**
   * The generated CodeBuild that will run the migration
   */
  readonly project: PipelineProject

  /**
   * The generated Action to add to a Pipeline that will run the migration
   */
  readonly action: CodeBuildAction

  constructor (scope: Construct, id: string, props: IPipelineRailsMigrationProps) {
    super(scope, id)

    const mergedEnvironmentVariables = {
      DOCKERHUB_USERNAME: {
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
        value: `${props.dockerCredentials.secretName}:username`,
      },
      DOCKERHUB_PASSWORD: {
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
        value: `${props.dockerCredentials.secretName}:password`,
      },
      REPO_URI: {
        type: BuildEnvironmentVariableType.PLAINTEXT,
        value: props.ecr.repositoryUri,
      },
      RAILS_ENV: {
        value: 'production',
      },
      RAILS_SECRET_KEY_BASE: {
        value: `${props.configPath}/secrets/secret_key_base`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      DB_HOSTNAME: {
        value: `${props.configPath}/database/host`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      DB_NAME: {
        value: `${props.configPath}/database/database`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      DB_USERNAME: {
        value: `${props.configPath}/database/username`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      DB_PASSWORD: {
        value: `${props.configPath}/database/password`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      DB_PORT: {
        value: `${props.configPath}/database/port`,
        type: BuildEnvironmentVariableType.PARAMETER_STORE,
      },
      ...props.environmentVariables,
    }
    const migrateSecurityGroup = new SecurityGroup(this, 'MigrateSecurityGroup', { vpc: props.vpc })

    // Map all environment variables to -e params to pass these on to the container at runtime
    const envPassParams = Object.keys(mergedEnvironmentVariables ?? {}).reduce((prev, current) => {
      prev = prev + `-e ${current}=$${current} `
      return prev
    }, '-e AWS_REGION=$AWS_REGION -e AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ')

    const entryPoint = props.migrateEntryPoint ?? './rails_migrate.sh'
    this.project = new PipelineProject(this, id, {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_2_0,
        privileged: true,
      },
      environmentVariables: mergedEnvironmentVariables,
      buildSpec: BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              'echo $REPO_URI:$IMAGE_TAG',
              '$(aws ecr get-login --no-include-email --region $AWS_REGION)',
              `docker run ${envPassParams} --entrypoint ${entryPoint} -t $REPO_URI:$IMAGE_TAG bundle exec rake db:migrate`,
            ],
          },
        },
        version: '0.2',
      }),
      securityGroups: [
        migrateSecurityGroup,
        props.databaseSecurityGroup,
      ],
      vpc: props.vpc,
    })
    props.dockerCredentials.grantRead(this.project)
    props.ecr.grantPull(this.project)

    this.project.addToRolePolicy(new PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter' + props.configPath + '/*'),
      ],
    }))
    this.action = new CodeBuildAction({
      input: props.railsBuild.appSource.artifact, // This is a formality since we are mainly just using codebuild as a host to pull the docker image
      project: this.project,
      actionName: `Migrate-${props.railsBuild.containerName}`,
      runOrder: 1,
      environmentVariables: {
        IMAGE_TAG: { value: props.railsBuild.imageTag },
      },
    })
  }
}

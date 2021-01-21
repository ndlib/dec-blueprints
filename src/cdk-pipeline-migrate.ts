import { BuildSpec, BuildEnvironmentVariableType, LinuxBuildImage, PipelineProject, PipelineProjectProps } from '@aws-cdk/aws-codebuild'
import { Artifact } from '@aws-cdk/aws-codepipeline'
import { SecurityGroup } from '@aws-cdk/aws-ec2'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { Construct, Fn } from '@aws-cdk/core'
import { FoundationStack } from './foundation-stack'

export interface ICDKPipelineDeployProps extends PipelineProjectProps {

    /**
     * Application source artifact.
     */
    readonly appSourceArtifact: Artifact;

    /**
     * Namespace to use for stack names etc
     */
    readonly namespace: string;

    readonly contextEnvName: string;
    readonly appBuildCommands?: string[];
    readonly postDeployCommands?: string[];
    /**
     * The SSM prefix to use for any environment variables
     */
    readonly ssmPrefix: string
    /**
     * The path to the Secrets Manager secret to allow authenticated Docker logins
     */
    readonly dockerhubCredentialsPath: string

    /**
     * Any runtime environments needed in addition to the one needed for cdk itself (currently nodejs: '12.x')  e.g. `python: '3.8'`
     */
    readonly additionalRuntimeEnvironments?: { [key: string]: string };
    /**
     * A Foundation Stack that contains VPC information
     */
    readonly foundationStack: FoundationStack
  }

export class RailsMigration extends Construct {
    public readonly project: PipelineProject
    public readonly action: CodeBuildAction

    constructor (scope: Construct, id: string, props: ICDKPipelineDeployProps) {
      super(scope, id)


      const migrateSecurityGroup = new SecurityGroup(this, 'MigrateSecurityGroup', {
        vpc: props.foundationStack.vpc,
      })
      let appSourceDir = '$CODEBUILD_SRC_DIR'
      const extraInputs: Array<Artifact> = []
      if (props.appSourceArtifact !== undefined) {
        extraInputs.push(props.appSourceArtifact)
        appSourceDir = `$CODEBUILD_SRC_DIR_${props.appSourceArtifact.artifactName}`
      }
      this.project = new PipelineProject(scope, `${id}Project`, {
        vpc: props.foundationStack.vpc,
        securityGroups: [
          migrateSecurityGroup,
          props.foundationStack.databaseSecurityGroup,
        ],
        environment: {
          buildImage: LinuxBuildImage.fromDockerRegistry('ruby:2.4.4', {
            secretsManagerCredentials: Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerhubCredentialsPath),
          }),
          privileged: true,
        },
        environmentVariables: {
          RDS_HOSTNAME: {
            value: `/all/${props.ssmPrefix}/database/host`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          RDS_DB_NAME: {
            value: `/all/${props.ssmPrefix}/database/database`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          RDS_USERNAME: {
            value: `/all/${props.ssmPrefix}/database/username`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          RDS_PASSWORD: {
            value: `/all/${props.ssmPrefix}/database/password`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          RDS_PORT: {
            value: `/all/${props.ssmPrefix}/database/port`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          RAILS_ENV: {
            value: 'production',
            type: BuildEnvironmentVariableType.PLAINTEXT,
          },
          RAILS_SECRET_KEY_BASE: {
            value: `/all/${props.ssmPrefix}/rails-secret-key-base`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
        },
        buildSpec: BuildSpec.fromObject({
          phases: {
            install: {
              commands: [
                'apt-key adv --keyserver keyserver.ubuntu.com --recv-keys AA8E81B4331F7F50 && apt-get update -qq && apt-get install -y build-essential libpq-dev wget nodejs unzip libssl-dev git libmysql++-dev',
                'gem install bundler -v 1.17.3',
                'bundle install',
              ],
            },
            build: {
              commands: [
                'bundle exec rake db:migrate --trace',
              ],
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

      this.action = new CodeBuildAction({
        actionName: 'DBMigrate',
        input: props.appSourceArtifact,
        extraInputs: extraInputs,
        project: this.project,
        runOrder: 1,
      })
    }
}

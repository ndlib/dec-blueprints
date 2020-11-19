import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipelineActions = require('@aws-cdk/aws-codepipeline-actions');
import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import { Topic } from '@aws-cdk/aws-sns';
import cdk = require('@aws-cdk/core');
import { BeehiveStack } from '../lib/beehive-stack';
import { ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions';
import { CfnOutput, Fn, Stack } from '@aws-cdk/core';
import { CDKPipelineProject } from '../lib/cdk-pipeline-project';
import { Runtime } from '@aws-cdk/aws-lambda';
//import { GlobalActions, NamespacedPolicy } from './namespaced-policy';
import { PipelineNotifications } from '@ndlib/ndlib-cdk';

export interface IDeploymentPipelineStackProps extends cdk.StackProps {
  readonly oauthTokenPath: string;
  readonly env: CustomEnvironment;
  readonly foundationStack: FoundationStack;
  readonly infraRepoOwner: string;
  readonly infraRepoName: string;
  readonly infraSourceBranch: string;
  readonly appRepoOwner: string;
  readonly appRepoName: string;
  readonly appSourceBranch: string;
  readonly testStack: BeehiveStack;
//  readonly prodStack: BeehiveStack;
//  readonly domainStackName: string;
//  readonly owner: string;
//  readonly contact: string;
//  readonly createDns: boolean;
//  readonly pipelineNotificationReceivers: string;
};

export class BeehivePipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IDeploymentPipelineStackProps) {
    super(scope, id, props);

    const repoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`;
//    const testUrl = `https://${props.testStack.fqdn}`;
//    const prodUrl = `https://${props.prodStack.fqdn}`;
    
    const artifactBucket = new Bucket(this, 'artifactBucket', { 
      encryption: BucketEncryption.KMS_MANAGED, 
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Source Actions
    const appSourceArtifact = new codepipeline.Artifact('AppCode');
    const appSourceAction = new codepipelineActions.GitHubSourceAction({
        actionName: 'AppCode',
        branch: props.appSourceBranch,
        oauthToken: cdk.SecretValue.secretsManager(props.env.oauthTokenPath, { jsonField: 'oauth' }),
        output: appSourceArtifact,
        owner: props.appRepoOwner,
        repo: props.appRepoName,
    });
    const infraSourceArtifact = new codepipeline.Artifact('InfraCode');
    const infraSourceAction = new codepipelineActions.GitHubSourceAction({
        actionName: 'InfraCode',
        branch: props.infraSourceBranch,
        oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
        output: infraSourceArtifact,
        owner: props.infraRepoOwner,
        repo: props.infraRepoName,
    });

    // Deploy Test Actions
    const testDeployProject = new CDKPipelineProject(this, 'BeehiveDeployTest', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          install: {
            commands: [
              'cd $CODEBUILD_SRC_DIR_AppCode',
              'npm install',
              'cd $CODEBUILD_SRC_DIR_InfraCode',
              'npm install',
            ],
            'runtime-versions': Runtime.NODEJS_10_X,
          },
          build: {
            commands: [
              'cd $CODEBUILD_SRC_DIR_AppCode',
              'npm run build',
              'cd $CODEBUILD_SRC_DIR_InfraCode',
              'npm run build',
              `npm run cdk deploy -- ${props.testStack.stackName} \
                --require-approval never --exclusively \
                -c namespace=th-dec -c env=dev \
                -c appSourcePath=$CODEBUILD_SRC_DIR/build`,
//                -c namespace=th-dec -c env=dev -c owner=${props.owner} -c contact=${props.contact} \
//                -c createDns=${props.createDns.toString()} -c domainStackName=${props.domainStackName} \
            ]
          },
        },
        version: '0.2',
      }),
      dependsOnStacks: [],
      targetStack: props.testStack,
    });
//    this.addDeployPolicies(props.testStack, testDeployProject, props);
    const testDeployAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Deploy',
      extraInputs: [infraSourceArtifact],
      input: appSourceArtifact,
      project: testDeployProject,
      runOrder: 1,
    });

    // Smoke Tests Action
/*    const smokeTestsProject = new codebuild.PipelineProject(this, 'ResearchAwardSmokeTests', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `BaseURL='${testUrl}' python spec/chrome_spec.py`,
            ],
            'run-as': 'seluser',
          },
          install: {
            commands: [
              'apt-get update && apt-get -y install python-pip && pip install selenium',
            ]
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('selenium/standalone-chrome'),
      },
    });
    const smokeTestsAction = new codepipelineActions.CodeBuildAction({
      input: appSourceArtifact, 
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    });

*/
    // Approval
    const approvalTopic = new Topic(this, 'ApprovalTopic');
    const approvalAction = new ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${repoUrl} has been deployed and is awaiting your approval. If you approve these changes, they will be deployed `,
      notificationTopic: approvalTopic,
      runOrder: 99, // This should always be the last action in the stage
    });

//    additionalInformation: `A new version of ${repoUrl} has been deployed to ${testUrl} and is awaiting your approval. If you approve these changes, they will be deployed to ${prodUrl}.`,

/*
    // Deploy Production Actions
    const prodDeployProject = new CDKPipelineProject(this, 'ResearchAwardDeployProd', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          install: {
            commands: [
              'cd $CODEBUILD_SRC_DIR_InfraCode',
              'npm install',
            ],
            'runtime-versions': Runtime.NODEJS_10_X,
          },
          build: {
            commands: [
              'npm run build',
              `npm run cdk deploy -- ${props.prodStack.stackName} \
                --require-approval never --exclusively \
                -c owner=${props.owner} -c contact=${props.contact} \
                -c createDns=${props.createDns.toString()} -c domainStackName=${props.domainStackName} \
                -c appSourcePath=$CODEBUILD_SRC_DIR/src`,
            ]
          },
        },
        version: '0.2',
      }),
      dependsOnStacks: [],
      targetStack: props.prodStack,
    });
    this.addDeployPolicies(props.prodStack, prodDeployProject, props);
    const prodDeployAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Deploy',
      extraInputs: [infraSourceArtifact],
      input: appSourceArtifact,
      project: prodDeployProject,
      runOrder: 1,
    });

    const smokeTestsProdProject = new codebuild.PipelineProject(this, 'ResearchAwardSmokeTestsProd', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `BaseURL='${prodUrl}' python spec/chrome_spec.py`,
            ],
            'run-as': 'seluser',
          },
          install: {
            commands: [
              'apt-get update && apt-get -y install python-pip && pip install selenium',
            ]
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('selenium/standalone-chrome'),
      },
    });
    const smokeTestsProdAction = new codepipelineActions.CodeBuildAction({
      input: appSourceArtifact, 
      project: smokeTestsProdProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    });
*/
    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      artifactBucket,
      stages: [
        {
          actions: [appSourceAction, infraSourceAction],
          stageName: 'Source',
        },
        {
//          actions: [testDeployAction, smokeTestsAction, approvalAction],
          actions: [testDeployAction, approvalAction],
          stageName: 'Test',
        },
//        {
//          actions: [prodDeployAction, smokeTestsProdAction],
//          stageName: 'Production',
//        },
      ],
    });
/*
    new PipelineNotifications(this, 'PipelineNotifications', {
      pipeline,
      receivers: props.pipelineNotificationReceivers,
    });
*/

    // Add exports to make it easier to attach slack approvals to this pipeline
    new CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'Name of the pipeline.',
      exportName: `${this.stackName}:PipelineName`,
    });
    new CfnOutput(this, 'ApprovalTopicArn', {
      value: approvalTopic.topicArn,
      description: 'ARN of the SNS topic for the Approval action.',
      exportName: `${this.stackName}:ApprovalTopicArn`,
    });
  }

//  addDeployPolicies(stack: Stack, project: CDKPipelineProject, props: IDeploymentPipelineStackProps) : void {
//    project.addToRolePolicy(NamespacedPolicy.globals(GlobalActions.S3 | GlobalActions.Cloudfront));
//    project.addToRolePolicy(NamespacedPolicy.iamRole(stack));
//    project.addToRolePolicy(NamespacedPolicy.lambda(stack));
//    project.addToRolePolicy(NamespacedPolicy.s3(stack));
//    if(props.createDns) {
//      project.addToRolePolicy(NamespacedPolicy.route53RecordSet(Fn.importValue(`${props.domainStackName}:Zone`)));
//    };
//  }
}

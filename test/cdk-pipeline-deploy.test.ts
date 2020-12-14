
describe('CDKPipelineDeploy', () => {
  test.todo('specifies the infrastructure code as the primary input')
  test.todo('adds the application code as extra inputs')
  test.todo('allows overriding where to find the cdk project')
  test.todo('runs any build scripts before staging the files and deploying')
  test.todo('runs any given post deploy commands')
  test.todo('outputs files correctly to a given artifact')
  test.todo('adds additional installs to the buildspec for each kvp in additionalRuntimeEnvironments')
  test.todo('authenticates with Dockerhub using the given path for credentials before deploying to assist with pulling for any container builds')
  test.todo('allows completely overriding the PipelineProject props if necessary')

  describe('deploy command', () => {
    test.todo('specifies the target stack exclusively')
    test.todo('adds the correct stack namespace override')
    test.todo('adds the correct env override')
    test.todo('adds any additional context overrides')
  })

  describe('gives the pipeline permission to', () => {
    test.todo('modify the target stack')
    test.todo('modify any dependent stacks')
    test.todo('read logs when generating output for failed events')
    test.todo('read CDK bootstrap stack/bucket')
  })
})

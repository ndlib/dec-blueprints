# Digital Exhibits and Collections Blueprints

![Node.js CI](https://github.com/ndlib/dec-blueprints/workflows/Node.js%20CI/badge.svg)

This is the infrastructure repo for the following DEC services:

- [Honeycomb](https://github.com/ndlib/honeycomb)
- [Beehive](https://github.com/ndlib/beehive)
- [Honeypot](https://github.com/ndlib/honeypot)
- [Buzz](https://github.com/ndlib/buzz)

## How to build

```sh
npm install
npm run build
```

## How to test

Check the style and run unit tests with:

```sh
npm test
```

If there are many style issues, you may want to just let the linter fix them for you with:

```sh
npm run format
```
## AWS prerequisites

Some stacks require secrets that get pulled from parameter store. If secrets do not exist then you can create them (replace `<value>` with the actual secret) by running the following:

```sh
aws ssm put-parameter --region us-east-1 --type 'SecureString' --name "/all/honeypot/secret_key_base" --value '<value>'
aws ssm put-parameter --region us-east-1 --type 'String' --name "/all/honeypot/rails_run_env" --value 'production'
```

## How to deploy

TODO: [ESU-1475] Fill in more details once we get further into the project

```sh
cdk deploy <stackname>
```

### Context Overrides

| Context Key | Description |
| ----------- | ------------|
| namespace   | Allows deploying stacks and resources under a different namespace from the default of `dec`. Ex: `cdk deploy -c namespace=mydec mydec-foundation` |

## Other useful commands

- `npm run watch` watch for changes and compile
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
- `cdk destroy` destroys a stack within this application

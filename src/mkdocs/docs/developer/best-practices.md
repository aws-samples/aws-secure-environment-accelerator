# 1. Best Practices

## 1.1. TypeScript and NodeJS

### 1.1.1. Handle Unhandled Promises

Entry point TypeScript files -- files that start execution instead of just defining methods and classes -- should have the following code snippet at the start of the file.

```typescript
process.on('unhandledRejection', (reason, _) => {
    console.error(reason);
    process.exit(1);
});
```

This prevents unhandled promise rejection errors by NodeJS. Please read <https://medium.com/dailyjs/how-to-prevent-your-node-js-process-from-crashing-5d40247b8ab2> for more information.

## 1.2. CloudFormation

### 1.2.1. Cross-Account/Region References

When managing multiple AWS accounts, the Accelerator may need permissions to modify resources in the managed accounts. For example, a transit gateway could be created in a shared network account and it need to be shared to the perimeter account to create a VPN connection.

In a single-account environment we would could just:

1. create a single stack and use `!Ref` to refer to the transit gateway;
2. or deploy two stacks
    - one stack that contains the transit gateway and creates a CloudFormation exported output that contains the transit gateway ID;
    - another stack that imports the exported output value from the previous stack and uses it to create a VPN connection.

In a multi-account environment this is not possible and we had to find a way to share outputs across accounts and regions.

See [Passing Outputs Between Phases](./development.md#162-passing-outputs-between-phases).

### 1.2.2. Resource Names and Logical IDs

Some resources, like `AWS::S3::Bucket`, can have an explicit name. Setting an explicit name can introduce some possible issues.

The first issue that could occur goes as follows:

-   the named resource has a retention policy to retain the resource after deleting;
-   then the named resource is created through a CloudFormation stack;
-   next, an error happens while creating or updating the stack and the stack rolls back;
-   and finally the named resource is deleted from the stack but has a retention policy to retain, so the resource not be deleted;

Suppose then that the stack creation issue is resolved and we retry to create the named resource through the CloudFormation stack:

-   the named resource is created through a CloudFormation stack;
-   the named resource will fail to create because a resource with the given name already exists.

The best way to prevent this issue from happening is to not explicitly set a name for the resource and let CloudFormation generate the name.

Another issue could occur when changing the logical ID of the named resource. This is documented in the following section.

### 1.2.3. Changing Logical IDs

When changing the logical ID of a resource CloudFormation assumes the resource is a new resource since it has a logical ID it does not know yet. When updating a stack, CloudFormation will always prioritize resource creation before deletion.

The following issue could occur when the resource has an explicit name. CloudFormation will try to create the resource anew and will fail since a resource with the given name already exists. Example of resources where this could happen are `AWS::S3::Bucket`, `AWS::SecretManager::Secret`.

### 1.2.4. Changing (Immutable) Properties

Not only changing logical IDs could cause CloudFormation to replace resources. Changing immutable properties also cause replacement of resources. See [Update behaviors of stack resources](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement).

Be especially careful when:

-   changing immutable properties for a named resource. Example of a resource is `AWS::Budgets::Budget`, `AWS::ElasticLoadBalancingV2::LoadBalancer`.
-   updating network interfaces for an `AWS::EC2::Instance`. Not only will this cause the instance to re-create, it will also fail to attach the network interfaces to the new EC2 instance. CloudFormation creates the new EC2 instance first before deleting the old one. It will try to attach the network interfaces to the new instance, but the network interfaces are still attached to the old instance and CloudFormation will fail.

For some named resources, like `AWS::AutoScaling::LaunchConfiguration` and `AWS::Budgets::Budget`, we append a hash to the name of the resource that is based on its properties. This way when an immutable property is changed, the name will also change, and the resource will be replaced successfully. See for example `src/lib/cdk-constructs/src/autoscaling/launch-configuration.ts` and `src/lib/cdk-constructs/src//billing/budget.ts`.

```typescript
export type LaunchConfigurationProps = autoscaling.CfnLaunchConfigurationProps;

/**
 * Wrapper around CfnLaunchConfiguration. The construct adds a hash to the launch configuration name that is based on
 * the launch configuration properties. The hash makes sure the launch configuration gets replaced correctly by
 * CloudFormation.
 */
export class LaunchConfiguration extends autoscaling.CfnLaunchConfiguration {
    constructor(scope: Construct, id: string, props: LaunchConfigurationProps) {
        super(scope, id, props);

        if (props.launchConfigurationName) {
            const hash = hashSum({ ...props, path: this.node.path });
            this.launchConfigurationName = `${props.launchConfigurationName}-${hash}`;
        }
    }
}
```

## 1.3. CDK

CDK makes heavy use of CloudFormation so all best practices that apply to CloudFormation also apply to CDK.

### 1.3.1. Logical IDs

The logical ID of a CDK component is calculated based on its path in the construct tree. Be careful moving around constructs in the construct tree -- e.g. changing the parent of a construct or nesting a construct in another construct -- as this will change the logical ID of the construct. Then you could end up with the issues described in section [Changing Logical IDs](./best-practices.md#123-changing-logical-ids) and section [Changing (Immutable) Properties](./best-practices.md#124-changing-immutable-properties).

See [Logical ID Stability](https://docs.aws.amazon.com/cdk/latest/guide/identifiers.html#identifiers_logical_id_stability) for more information.

### 1.3.2. Moving Resources between Nested Stacks

In some cases we use nested stacks to overcome [the limit of 200 CloudFormation resources per stack](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-limits.html).

In the code snippet below you can see how we generate a dynamic amount of nested stack based on the amount of interface endpoints we construct. The `InterfaceEndpoint` construct contains CloudFormation resources so we have to be careful to not exceed the limit of 200 CloudFormation resources per nested stack. That is why we limit the amount of interface endpoints to 30 per nested stack.

```typescript
let endpointCount = 0;
let endpointStackIndex = 0;
let endpointStack;
for (const endpoint of endpointConfig.endpoints) {
    if (!endpointStack || endpointCount >= 30) {
        endpointStack = new NestedStack(accountStack, `Endpoint${endpointStackIndex++}`);
        endpointCount = 0;
    }
    new InterfaceEndpoint(endpointStack, pascalCase(endpoint), {
        serviceName: endpoint,
    });
    endpointCount++;
}
```

We have to be careful here though. Suppose the configuration file contains 40 interface endpoints. The first 30 interface endpoints will be created in the first nested stack; the next 10 interface endpoints will be created in the second nested stack. Suppose now that we remove the first nested endpoint from the configuration file. This will cause the 31st interface endpoint to become the 30th interface endpoint in the list and it will cause the interface endpoint to be moved from the second nested stack to the first nested stack. This will cause the stack updates to fail since CloudFormation will first try to create the interface endpoint in the first nested stack before removing it from the second nested stack. We do currently not support changes to the interface endpoint configuration because of this behavior.

### 1.3.3. L1 vs. L2 Constructs

See [AWS Construct library](https://docs.aws.amazon.com/cdk/latest/guide/constructs.html#constructs_lib) for an explanation on L1 and L2 constructs.

The L2 constructs for EC2 and VPC do not map well onto the Accelerator-managed resources. For this reason we mostly use L1 CDK constructs -- such as `ec2.CfnVPC`, `ec2.CfnSubnet` -- instead of using L2 CDK constructs -- such as `ec2.Vpc` and `ec2.Subnet`.

### 1.3.4. CDK Code Dependency on Lambda Function Code

You can read about the distinction between CDK code and runtime code in the introduction of the [Development](./development.md#11-overview) section.

CDK code can depend on runtime code. For example when we want to create a Lambda function using CDK, we need the runtime code to define the Lambda function. We use `npm scripts`, `npm` dependencies and the `NodeJS` `modules` API to define this dependency between CDK code and runtime code.

First of all, we create a separate folder that contains the workspace and runtime code for our Lambda function. Throughout the project we've called these workspaces `...-lambda` but it could also be named `...-runtime`. See [src/lib/custom-resources/cdk-acm-import-certificate/runtime/package.json](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/v1.5.6-a/src/lib/custom-resources/cdk-acm-import-certificate/runtime/package.json).

This workspace's `package.json` file needs a `prepare` script that compiles the runtime code. See [`npm-scripts`](https://docs.npmjs.com/misc/scripts).

The `package.json` file also needs a `name` and a `main` entry that points to the compiled code.

`runtime/package.json`

```json
{
    "name": "lambda-fn-runtime",
    "main": "dist/index.js",
    "scripts": {
        "prepare": "webpack-cli --config webpack.config.ts"
    }
}
```

Now when another workspace depends on our Lambda function runtime code workspace, the `prepare` script will run and it will compile the Lambda function runtime code.

Next, we add the dependency to the new workspace to the workspace that contains the CDK code using `pnpm` or by adding it to `package.json`.

`cdk/package.json`

```json
{
    "devDependencies": {
        "lambda-fn-runtime": "workspace:^0.0.1"
    }
}
```

In the CDK code we can now resolve the path to the compiled code using the `NodeJS` `modules` API. See [NodeJS `modules` API](https://nodejs.org/api/modules.html#modules_require_resolve_request_options).

`cdk/src/index.ts`

```typescript
class LambdaFun extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Find the runtime package folder and resolves the `main` entry of `package.json`.
        // In our case this is `node_modules/lambda-fn-runtime/dist/index.js`.
        const runtimeMain = resolve.require('lambda-fn-runtime');

        // Find the directory containing our `index.js` file.
        // In our case this is `node_modules/lambda-fn-runtime/dist`.
        const runtimeDir = path.dirname(lambdaPath);

        new lambda.Function(this, 'Resource', {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset(runtimeDir),
            handler: 'index.handler', // The `handler` function in `index.js`
        });
    }
}
```

You now have a CDK Lambda function that uses the compiled Lambda function runtime code.

> _Note_: The runtime code needs to recompile every time it changes since the `prepare` script only runs when the runtime workspace is installed.

### 1.3.5. Custom Resource

We create custom resources for functionality that is not supported natively by CloudFormation. We have two types of custom resources in this project:

1. Custom resource that calls an SDK method;
2. Custom resource that needs additional functionality and is backed by a custom Lambda function.

CDK has a helper construct for the first type of custom resources. See [CDK `AwsCustomResource` documentation](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-cdk-lib_custom-resources.AwsCustomResource.html). This helper construct is for example used in the custom resource [`ds-log-subscription`](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/v1.5.6-a/src/lib/custom-resources/cdk-ds-log-subscription).

The second type of custom resources requires a custom Lambda function runtime as described in the previous section. For example [acm-import-certificate](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/v1.5.6-a/src/lib/custom-resources/cdk-acm-import-certificate) is backed by a custom Lambda function.

Only a single Lambda function is created per custom resource, account and region. This is achieved by creating only a single Lambda function in the construct tree.

`src/lib/custom-resources/custom-resource/cdk/index.ts`

```typescript
class CustomResource extends Construct {
    constructor(scope: Construct, id: string, props: CustomResourceProps) {
        super(scope, id);

        new cdk.CustomResource(this, 'Resource', {
            resourceType: 'Custom::CustomResource',
            serviceToken: this.lambdaFunction.functionArn,
        });
    }

    private get lambdaFunction() {
        const constructName = `CustomResourceLambda`;

        const stack = cdk.Stack.of(this);
        const existing = stack.node.tryFindChild(constructName);
        if (existing) {
            return existing as lambda.Function;
        }

        // The package '@aws-accelerator/custom-resources/cdk-custom-resource-runtime' contains the runtime code for the custom resource
        const lambdaPath = require.resolve('@aws-accelerator/custom-resources/cdk-custom-resource-runtime');
        const lambdaDir = path.dirname(lambdaPath);

        return new lambda.Function(stack, constructName, {
            code: lambda.Code.fromAsset(lambdaDir),
        });
    }
}
```

### 1.3.6. Escape Hatches

Sometimes CDK does not support a property on a resource that CloudFormation does support. You can then override the property using the `addOverride` or `addPropertyOverride` methods on CDK CloudFormation resources. See [CDK escape hatches](https://docs.aws.amazon.com/cdk/latest/guide/cfn_layer.html).

#### 1.3.6.1. AutoScaling Group Metadata

An example where we override metadata is when we create a launch configuration.S

```typescript
const launchConfig = new autoscaling.CfnLaunchConfiguration(this, 'LaunchConfig', { ... });

launchConfig.addOverride('Metadata.AWS::CloudFormation::Authentication', {
  S3AccessCreds: {
    type: 'S3',
    roleName,
    buckets: [bucketName],
  },
});

launchConfig.addOverride('Metadata.AWS::CloudFormation::Init', {
  configSets: {
    config: ['setup'],
  },
  setup: {
    files: {
      // Add files here
    },
    services: {
      // Add services here
    },
    commands: {
      // Add commands here
    },
  },
});
```

#### 1.3.6.2. Secret `SecretValue`

Another example is when we want to use `secretsmanager.Secret` and set the secret value.

```typescript
function setSecretValue(secret: secrets.Secret, value: string) {
    const cfnSecret = secret.node.defaultChild as secrets.CfnSecret; // Get the L1 resource that backs this L2 resource
    cfnSecret.addPropertyOverride('SecretString', value); // Override the property `SecretString` on the L1 resource
    cfnSecret.addPropertyDeletionOverride('GenerateSecretString'); // Delete the property `GenerateSecretString` from the L1 resource
}
```

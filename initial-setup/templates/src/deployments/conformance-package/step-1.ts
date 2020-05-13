import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { VpcConfigRule } from '@config-rules/vpc-config-rule';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../common/account-stacks';
import { VpcOutput } from '../vpc';
import { ConformancePack } from './conformance-pack';

interface ConformancePackStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

type AccountPacks = { [accountKey: string]: ConformancePack };

export async function step1(props: ConformancePackStep1Props) {
  const accountPacks = createConformancePack(props);
  createVpcConfigRule({
    ...props,
    accountPacks,
  });
}

function createConformancePack(props: ConformancePackStep1Props): AccountPacks {
  const { accountStacks, config } = props;
  const accountPacks: AccountPacks = {};

  for (const [accountKey, _] of config.getMandatoryAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    const bucket = new s3.Bucket(accountStack, 'ConformancePackBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        principals: [
          new iam.ArnPrincipal(
            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/aws-service-role/config-conforms.amazonaws.com/*`,
          ),
        ],
        resources: [bucket.arnForObjects('*')],
      }),
    );

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetBucketAcl'],
        principals: [
          new iam.ArnPrincipal(
            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/aws-service-role/config-conforms.amazonaws.com/*`,
          ),
        ],
        resources: [bucket.bucketArn],
      }),
    );

    const pack = new ConformancePack(accountStack, 'ConformancePack', {
      deliveryS3Bucket: bucket.bucketName,
      conformancePackName: 'ConformancePack',
      // TODO Pass template parameter
      conformancePackInputParameters: [],
    });
    accountPacks[accountKey] = pack;
  }
  return accountPacks;
}

function createVpcConfigRule(props: ConformancePackStep1Props & { accountPacks: AccountPacks }) {
  const { accountStacks, accountPacks, config, outputs } = props;
  for (const { ouKey, accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (ouKey === 'core') {
      continue;
    }

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcName = vpcConfig.name;
    const vpcOutput = vpcOutputs.find(o => o.vpcName === vpcName);
    if (!vpcOutput) {
      console.warn(`Skipping VPC config rule for VPC "${vpcName}": no VPC found in outputs`);
      continue;
    } else if (!vpcOutput.flowLogsDestination) {
      console.debug(`Skipping VPC config rule for VPC "${vpcName}": no flow logs destination`);
      continue;
    }

    // Deploy the config rule in the account stack that has the VPC
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const accountPack = accountPacks[accountKey];
    if (!accountPack) {
      continue;
    }

    // Create the rule and add it to the account conformance pack
    const rule = new VpcConfigRule(accountStack, `VpcConfigRule${vpcName}`, {
      expectedVpcFlowLogBucket: vpcOutput.flowLogsDestination,
    });
    accountPack.addConfigRule(rule);
  }
}

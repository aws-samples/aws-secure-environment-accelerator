import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { VpcConfigRule, VpcConfigRuleExpectedFlowLogDestination } from '@config-rules/vpc-config-rule';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../common/account-stacks';
import { VpcOutput } from '../vpc';
import { OrganizationConformancePack } from './conformance-pack';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { getAccountId, Account } from '../../utils/accounts';

interface ConformancePackStep1Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  outputs: StackOutput[];
  executionRoleName: string;
}

export async function step1(props: ConformancePackStep1Props) {
  const { accountStacks, config } = props;

  const primaryAccount = config.getAccountByLandingZoneAccountType('primary');
  if (!primaryAccount) {
    throw new Error(`Cannot find the primary account`);
  }

  const [primaryAccountKey, _] = primaryAccount;
  const primaryAccountStack = accountStacks.getOrCreateAccountStack(primaryAccountKey);

  const conformancePack = createConformancePack({
    primaryAccountStack,
  });

  // Create the VPC config rule
  createVpcConfigRule({
    ...props,
    primaryAccountStack,
    conformancePack,
  });
}

function createConformancePack(props: { primaryAccountStack: AcceleratorStack }): OrganizationConformancePack | undefined {
  const { primaryAccountStack } = props;

  const bucket = new s3.Bucket(primaryAccountStack, 'ConformancePackBucket', {
    bucketName: 'awsconfigconforms-pbmmaccel',
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:*'],
      principals: [new iam.ServicePrincipal('config.amazonaws.com')],
      resources: [bucket.bucketArn],
    }),
  );

  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:*'],
      principals: [new iam.ServicePrincipal('config.amazonaws.com')],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        StringEquals: {
          's3:x-amz-acl': 'bucket-owner-full-control',
        },
      },
    }),
  );

  return new OrganizationConformancePack(primaryAccountStack, 'ConformancePack', {
    deliveryS3Bucket: bucket.bucketName,
    organizationConformancePackName: 'ConformancePack',
    // TODO Pass template parameter
    conformancePackInputParameters: [],
  });
}

function createVpcConfigRule(
  props: ConformancePackStep1Props & {
    primaryAccountStack: AcceleratorStack;
    conformancePack?: OrganizationConformancePack;
  },
) {
  const { primaryAccountStack, conformancePack, config, accounts, outputs, executionRoleName } = props;
  const expectedVpcFlowLogBuckets: VpcConfigRuleExpectedFlowLogDestination[] = [];
  for (const { ouKey, accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (ouKey === 'core') {
      continue;
    }

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    for (const vpcOutput of vpcOutputs) {
      if (!vpcOutput.flowLogsDestination) {
        continue;
      }

      expectedVpcFlowLogBuckets.push({
        accountId: getAccountId(accounts, accountKey),
        executionRoleName,
        vpcId: vpcOutput.vpcId,
        flowLogDestination: vpcOutput.flowLogsDestination,
      });
    }
  }

  // Create the rule and add it to the account conformance pack
  const rule = new VpcConfigRule(primaryAccountStack, `VpcConfigRule`, {
    expectedVpcFlowLogDestinations: expectedVpcFlowLogBuckets,
  });
  conformancePack!.addConfigRule(rule);
}

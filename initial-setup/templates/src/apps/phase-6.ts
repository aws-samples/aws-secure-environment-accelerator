import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { pascalCase } from 'pascal-case';
import { VpcOutput } from '../deployments/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Alb } from '../common/alb';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const albConfig = accountConfig.alb;
    if (!albConfig) {
      continue;
    }
    const accountId = getAccountId(accounts, accountKey);

    const stack = new AcceleratorStack(app, 'Alb', {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      stackName: `PBMMAccel-${pascalCase('alb')}`,
    });

    for (const alb of Object.values(albConfig)) {
      const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(output => output.vpcName === alb.vpc);
      if (!vpcOutput) {
        throw new Error(`Cannot find output with vpc name ${alb.vpc}`);
      }

      const vpcId = vpcOutput.vpcId;
      const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === alb.subnets).map(s => s.subnetId);

      // TODO get it from outputs
      const s3FlowLogsBucketArn = 'arn:aws:s3:::pbmmaccel-perimeter-phas-flowlogcontainerflowlogb-uiqjxa0030wf';
      const flowLogsBucket = s3.Bucket.fromBucketArn(stack, `AlbFlowLogsBucket${accountKey}${alb.name}`, s3FlowLogsBucketArn);

      console.log('flow logs bucket name', flowLogsBucket.bucketName);

      flowLogsBucket.grantPut(new iam.ArnPrincipal('arn:aws:iam::985666609251:root'));

      new Alb(stack, `Alb${pascalCase(accountKey)}${alb.name}`, {
        albConfig: alb,
        vpcId: vpcId,
        subnetIds: subnetIds,
        securityGroupIds: ['sg-0d08cf982bc8ca222'],
        bucketName: flowLogsBucket.bucketName,
      });
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();

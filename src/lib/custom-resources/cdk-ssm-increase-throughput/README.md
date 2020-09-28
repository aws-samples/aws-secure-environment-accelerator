# SSM Increase Throughput

This is a custom resource to set limit for SSM Parameter Store Throughput `updateServiceSetting` API call.

## Usage

    import { SsmIncreaseThroughput } from '@aws-accelerator/custom-resource-ssm-increase-throughput';

    new SsmIncreaseThroughput(accountStack, 'UpdateSSMParameterStoreThroughput', {
      roleArn: ssmUpdateRole.roleArn,
    );

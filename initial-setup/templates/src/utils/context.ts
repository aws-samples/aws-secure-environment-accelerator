export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  cfnDnsEndopintIpsLambdaArn: string;
}

export function loadContext(): Context {
  if (process.env.CONFIG_MODE === 'development') {
    return {
      acceleratorName: 'PBMM',
      acceleratorPrefix: 'PBMMAccel-',
      cfnDnsEndopintIpsLambdaArn:
        'arn:aws:lambda:ca-central-1:144459094893:function:PBMMAccel-InitialSetup-PipelineDnsEndpointIPPoller-4XC0DLYZ6L0M',
    };
  }

  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
    cfnDnsEndopintIpsLambdaArn: process.env.CFN_DNS_ENDPOINT_IPS_LAMBDA_ARN!,
  };
}

export function createQuarantineScpName(props: { acceleratorPrefix: string }) {
  return `${props.acceleratorPrefix}Quarantine-New-Object`;
}

export function createQuarantineScpContent(props: { acceleratorPrefix: string }) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'DenyAllAWSServicesExceptBreakglassRoles',
        Effect: 'Deny',
        Action: '*',
        Resource: '*',
        Condition: {
          ArnNotLike: {
            'aws:PrincipalARN': [
              'arn:aws:iam::*:role/AWSCloudFormationStackSetExecutionRole',
              `arn:aws:iam::*:role/${props.acceleratorPrefix}*`,
            ],
          },
        },
      },
    ],
  });
}

### Currently this module is not being used ###

# Associate Hosted Zones to VPC

This is a custom resource to associate vpc to Hosted Zone Used `createVPCAssociationAuthorization`, `associateVPCWithHostedZone`, `deleteVPCAssociationAuthorization` and `deleteVPCAssociationAuthorization` API calls.

## Usage

    import { AssociateHostedZones } from '@aws-accelerator/custom-resource-associate-hosted-zones';

    new AssociateHostedZones(accountStack, constructName, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds,
        roleArn,
      });

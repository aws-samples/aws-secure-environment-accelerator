### Currently this module is not being used ###

# DisAssociate Hosted Zones to VPC

This is a custom resource to associate vpc to Hosted Zone Used `createVPCAssociationAuthorization`, `disassociateVPCFromHostedZone` and `deleteVPCAssociationAuthorization` API calls.

## Usage

    import { DisAssociateHostedZones } from '@aws-accelerator/custom-resource-disassociate-hosted-zones';

    new DisAssociateHostedZones(accountStack, constructName, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds,
        roleArn,
      });

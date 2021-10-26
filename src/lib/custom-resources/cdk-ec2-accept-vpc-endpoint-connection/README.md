# Directory Service Log Subscription

This is a Custom resource implementation that accepts Vpc Endpoint Connection using `ec2.acceptVpcEndpointConnections` API call.

## Usage

    import { Ec2AcceptVpcEndpointConnection } from '@aws-accelerator/custom-resource-accept-vpc-endpoint-connection';

    new Ec2AcceptVpcEndpointConnection(this, `GwlbVpcEndpointAccept`, {
      endpoints: [endpoint.ref],
      serviceId: this.endpointService.ref,
      roleArn: roleOutput.roleArn,
    });

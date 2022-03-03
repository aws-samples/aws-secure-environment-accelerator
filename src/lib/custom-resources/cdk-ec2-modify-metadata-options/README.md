# EC2 Disable API Termination Protection

This is a custom resource that allows the modification of metadata-options which was not possible so far for EC2 
instances (https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/655).
It modifies the EC2 instances metadata-options using `ec2.modifyInstanceMetadataOptions` API call.

## Usage

    import { EC2ModifyMetadataOptions } from '@aws-accelerator/custom-resource-ec2-modify-metadata-options';

    new EC2ModifyMetadataOptions(this, `ModifyMetadataOptions`, {
      ec2Arn: this.resource.ref,
      ec2Name: this.props.name,
      httpEndpoint: this.props.httpEndpoint,
      httpProtocolIpv6: this.props.httpProtocolIpv6,
      httpPutResponseHopLimit: this.props.httpPutResponseHopLimit,
      httpTokens: this.props.httpTokens
    });

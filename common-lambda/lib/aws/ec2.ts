import * as aws from 'aws-sdk';
import * as ec2 from 'aws-sdk/clients/ec2';

export class EC2 {
  private readonly client: aws.EC2;
  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.EC2({
      credentials,
    });
  }

  async createRouteForPcx(routeTableId: string, destinationCir: string, target: string): Promise<ec2.CreateRouteResult> {
    const params = {
      DestinationCidrBlock: destinationCir,
      RouteTableId: routeTableId,
      VpcPeeringConnectionId: target
    }
    return await this.client.createRoute(params).promise();
}
}
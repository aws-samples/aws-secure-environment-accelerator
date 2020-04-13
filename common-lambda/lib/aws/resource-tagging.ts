import * as aws from 'aws-sdk';
import * as ec2 from 'aws-sdk/clients/ec2';

export class TagResources {
  private readonly client: aws.EC2;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.EC2({
      credentials,
    });
  }

  async createTags(input: ec2.CreateTagsRequest): Promise<void> {
    // const params = {
    //   Resources: ['subnet-05bf9e405795f7e1e'],
    //   Tags: [
    //     {
    //       Key: 'Stack',
    //       Value: 'Development',
    //     },
    //     {
    //       Key: 'Name',
    //       Value: 'Central_VPC',
    //     },
    //   ],
    // };

    this.client.createTags(input, function (err, data) {
      if (err) console.log(err, err.stack);
      // an error occurred
      else console.log(data); // successful response
    });
  }
}

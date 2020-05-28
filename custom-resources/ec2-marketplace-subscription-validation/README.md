# EC2 Image Finder

This is a custom resource that makes ec2.runInstances and returns status to check subscription status for Market Place AMI


## Usage

    import { CfnMarketPlaceSubscriptionCheck } from '@custom-resources/ec2-marketplace-subscription-validation';

    const resource = ...

    const subscritionCheckResponse = new CfnMarketPlaceSubscriptionCheck(scope, id, {
    imageId,
    subnetId,
  });
  return subscritionCheckResponse.getAttString('Status');

### Possible Output

  Subscribed | OptInRequired

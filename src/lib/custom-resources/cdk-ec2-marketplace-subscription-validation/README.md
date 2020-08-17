# EC2 Market Place Image SubscriptionCheck

This is a custom resource that makes ec2.runInstances and returns status to check subscription status for Market Place AMI


## Usage

    import { CfnMarketPlaceSubscriptionCheck } from '@aws-accelerator/custom-resource-ec2-marketplace-subscription-validation';

    const resource = ...

    const subscritionCheckResponse = new CfnMarketPlaceSubscriptionCheck(scope, id, {
    imageId,
    subnetId,
  });
  return subscritionCheckResponse.getAttString('Status');

### Possible Output

  Subscribed | OptInRequired

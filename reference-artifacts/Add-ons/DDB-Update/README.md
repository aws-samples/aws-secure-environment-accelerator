## CloudFormation template for DynamoDB table

This CloudFormation script does the following:

1. Create an Amazon S3 bucket for the JSON file containing CIDR ranges
1. Create an AWS Lambda function that will populate the DynamoDB table
1. Setup a trigger such that the Lambda function will run everytime a file is uploaded in the bucket

Usage:

1. Run the CloudFormation template in the "home" region
1. Navigate to Outputs and note the Amazon S3 bucket's name
1. Modify the attached sample JSON file, as appropriate
1. Upload the JSON file in the S3 bucket
1. The DynamoDB table will be populated with the CIDR ranges

Precautions:

1. The JSON file must follow the pattern in the sample file but any number of CIDRs can be added
1. Uploading a second file will overwrite the DynamoDB with the new values
1. The file must have a name of `cidr-update-list.json` for the IAM permissions to work correctly

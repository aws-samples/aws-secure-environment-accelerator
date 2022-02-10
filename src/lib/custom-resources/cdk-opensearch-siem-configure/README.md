# siem-on-amazon-opensearch-service

This is a custom resource to configure OpenSearch for SIEM.


The AWS Secure Environment Accelerator now supports deploying the AWS Open Source project aws-samples/siem-on-amazon-opensearch-service which can be found here: https://github.com/aws-samples/siem-on-amazon-opensearch-service. The files in this folder are based on siem-on-amazon-opensearch-service
v2.6.0 (tag) and will periodically be updated and can be found or recreated from the files in that project using the procedures:

**os-loader.zip** - can be found here: https://github.com/aws-samples/siem-on-amazon-opensearch-service/tree/main/source/lambda/es_loader. This project contains a copy in reference-artifacts/siem/os-loader.zip. The processing lambda code is the exact same as the project, but the **aws.ini** file has been updated to match S3 key prefixes used by the ASEA. Updates to the os-loader.zip should contain the latest aws.ini in use.

The os-loader.zip file can be created by running the **step1-build-lambda-pkg.sh** in deployments/cdk-solution-helper in the siem-on-amazon-opensearch-service repo. Note that the ``index.py`` code file has the property ``__version__ = '2.6.0'`` which is helpful to determine the version deployed.

**opensearch-config.json** - can be found here in its original INI format: https://github.com/aws-samples/siem-on-amazon-opensearch-service/blob/main/source/lambda/deploy_es/data.ini. This project has rewritten that INI file into a JSON format. Any changes/new updates to the data.ini file can easily be applied by translating the change into JSON. The opensearch-config.json can be found in reference-artifacts/siem/opensearch-config.json.

**dashboard.ndjson.zip** - can be found here https://aes-siem.s3.amazonaws.com/assets/saved_objects.zip or https://github.com/aws-samples/siem-on-amazon-opensearch-service/tree/main/source/saved_objects. Use OpenSearch UI to Import/Export the 'Saved Objects'.


## Usage

```
import { OpenSearchSiemConfigure } from '@aws-accelerator/custom-resource-opensearch-siem-configure';


const openSearchConfigure = new OpenSearchSiemConfigure(accountStack, `${acceleratorPrefix}OpenSearchConfigure`, {
    openSearchDomain: domain.dns,
    adminRoleMappingArn: authenticatedRole.roleArn,
    adminOpenSearchRoleArn: adminRole,
    openSearchConfigurationS3Bucket: centralConfigBucketName,
    openSearchConfigurationS3Key: openSearchSIEMDeploymentConfig['opensearch-configuration'],
    lambdaExecutionRole: lambdaRole.roleArn,
    vpc: vpc.id,
    availablityZones: azs,
    domainSubnetIds: domainSubnetIds,
    securityGroupIds: securityGroupIds,
    stsDns: stsHostedZoneDnsEntries
  });

```

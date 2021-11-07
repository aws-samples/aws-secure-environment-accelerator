# Put S3 Bucket Notifications

This is a custom resource configure OpenSearch for SIEM.

## Usage

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


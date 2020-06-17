# Retrieve Organization properties

This is a custom resource to retrieve Organization using `DescribeOrganization` API call.

## Usage

    const organization = new Organizations();

    logBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new AnyPrincipal()],
        actions: ['s3:GetEncryptionConfiguration', 's3:PutObject'],
        resources: [logBucket.bucketArn, `${logBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': organization.organizationId,
          },
        },
      }),
    );


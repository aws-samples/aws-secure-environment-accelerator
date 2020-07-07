# Enable Macie admin account

This is a custom resource to delegate Macie admin account using `EnableOrganizationAdminAccount` API call.

## Usage

    // Enable Macie admin account for all regions
    regions?.map(region => {
      // Guard duty need to be enabled from master account of the organization
      const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey, region);

      if (masterAccountId) {
        const admin = new MacieEnableAdmin(masterAccountStack, 'GuardDutyAdmin', {
          accountId: masterAccountId,
        });
      }
    });


# Add Macie member account

This is a custom resource to add Macie member account using `createMember` API call.

## Usage

    // Add Macie members for all regions
    regions?.map(region => {
      const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);

      const accountDetails = accounts.map(account => ({
        accountId: account.id,
        email: account.email,
      }));
      const members = new MacieCreateMember(masterAccountStack, 'MacieCreateMember', {
        accountDetails,
      });
    });


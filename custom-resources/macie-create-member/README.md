# Add Macie member account

This is a custom resource to add Macie member account using `createMember` API call.

## Usage

    // Add org members to Macie except Macie master account
    const accountDetails = accounts.map(account => ({
      accountId: account.id,
      email: account.email,
    }));
    for (const [index, account] of Object.entries(accountDetails)) {
      if (account.accountId !== masterAccountId) {
        const members = new MacieCreateMember(masterAccountStack, `MacieCreateMember${index}`, account);
      }
    }


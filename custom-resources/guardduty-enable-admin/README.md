# Enable Guard Duty admin

This is a custom resource to Enable Guard Duty admin from `enable-organization-admin-account` API call.

## Usage

    // Enable guard duty admin for master account
    const admin = new GuardDutyAdmin(masterAccountStack, 'GuardDutyAdmin', {
      accountId: masterAccountId,
    });


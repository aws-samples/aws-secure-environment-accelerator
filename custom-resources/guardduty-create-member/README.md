# Create Guard Duty members

This is a custom resource to create Guard Duty members from `CreateMembers` API call.

## Usage

    // Creating Guard Duty Members
    const detector = new GuardDutyDetector(masterAccountStack, 'GuardDutyDetector');

    const accountDetails = props.accounts.map(account => ({
      AccountId: account.id,
      Email: account.email,
    }));
    const members = new GuardDutyCreateMember(masterAccountStack, 'GuardDutyCreateMember', {
      accountDetails,
      detectorId: detector.detectorId,
    });


# EC2 Image Finder

This is a custom resource to Accept Security Hub invitations send by Master Account. 
Used `listInvitations`, `acceptInvitation` API calls.

## Usage

    import { SecurityHubAcceptInvites } from '@custom-resources/security-hub-accept-invites';

    const acceptInviteSecurityHubResource = new SecurityHubAcceptInvites(
      this,
      `AcceptInviteSecurityHubStandards-${account.key}`,
      {
        masterAccountId
      }
    );
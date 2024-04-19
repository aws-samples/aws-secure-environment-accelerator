# 1. CA-West-1 (Calgary) Region Configurations and Customizations

## 1.1. Summary
The configurations described in this documentation section explains how to enable the Calgary (ca-west-1) region. This currently depends on ASEA version > 1.6.1, and extends into ca-west-1 (i.e. ca-west-1 is NOT the home region). Before applying any of the configuration below, be sure to review the networking architecture, and deploy in a test ASEA instance first if possible. 

Since March 20, 2019, when AWS adds a Region, the new Region is disabled by default. If you want your users to be able to create and manage resources in a new Region, you first need to enable that Region. The Calgary region (ca-west-1) is an 'Opt-in' region that requires enablement configuration for all AWS accounts. To update the enabled Regions for member accounts of your AWS Organizations, perform the steps in the following procedure.
1. _Requires:_ Enable trusted access for the AWS Account Management service. To set this up, see [Enabling trusted access for AWS Account Management.](https://docs.aws.amazon.com/accounts/latest/reference/using-orgs-trusted-access.html)
2. Sign in to the AWS Organizations console with your organization's management account credentials.
3. On the AWS accounts page, select the account that you want to update.
4. Choose the Account settings tab.
5. Under Regions, select the Region you want to enable or disable.
6. Choose Actions, and then choose either Enable or Disable option.
7. If you chose the Enable option, review the displayed text and then choose Enable region.
   
This can also be executed using the AWS CLI & SDKs, review this [page](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html#manage-acct-regions-update-account-enabled) for details.




## 1.2. Network Architecture -- Mirrored from Home Region
![Mirrored ca-west-1 Networking](./img/mirrored-ca-west-1-network.png)

The _Mirrored from Home Region_ network architecture mirrors the network architecture from the home region (e.g. ca-central-1). In the diagram above, ca-west-1 has its own Transit Gateway, same set of VPCs, Endpoint configuration, and Perimeter VPC/Firewall configuration. Additionaly, this configuration sample does not connect ca-central-1 with ca-west-1 via Transit Gateway Peering (see #1.3 below). Note that in the sample config provided, the IP CIDR ranges are different than the home region. 

## 1.3. Network Architecture -- Cross Region Peering
(coming soon)
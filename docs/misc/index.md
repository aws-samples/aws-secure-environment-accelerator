# AWS Secure Environment Architecture: Miscellaneous Guides

The following sections provide guidance on miscellaneous operational topics within the _AWS Secure Environment Architecture_.

<!-- TOC depthFrom:2 -->

- [1. Web-Based Password Reset Bastion](#1-web-based-password-reset-bastion)
  - [1.1. Components](#11-components)
    - [1.1.1. Remote Desktop Services](#111-remote-desktop-services)
    - [1.1.2. Remote Desktop Session Host(s)](#112-remote-desktop-session-hosts)
    - [1.1.3. RD Web Access](#113-rd-web-access)
    - [1.1.4. Security Group Ingress](#114-security-group-ingress)
    - [1.1.5. Remote Desktop Services Collection](#115-remote-desktop-services-collection)
  - [1.2. Web Configuration](#12-web-configuration)
  - [1.3. Password Resets](#13-password-resets)
  - [1.4. Perimeter Network / Load Balancer](#14-perimeter-network--load-balancer)

<!-- /TOC -->

## 1. Web-Based Password Reset Bastion

The AWS Secure Environment Architecture contains an AWS Directory Service Microsoft AD installation as part of the standard recommended architecture. This is a highly-available domain-controller with a standalone domain used with organization's cloud workloads. So long as this component does not have a trust relationship to an existing, likely on-premises, domain, it will maintain its own directory of users on its own domain, including associated credentials.

Many customers have requested that a password reset process be available, with the following properties:

1. Password resets must be user-initiated
2. Password resets must take place over port `443` from on-premises IP space; i.e. not over an RDP session from a domain-joined instance

While the above is not native functionality of the AWS Directory Service Microsoft AD (MAD) service, it may be implemented atop a configured _AWS Secure Environment Architecture_. Note that this guide assumes familiarity with **Remote Desktop Services** deployments as given by official Microsoft [guidance][guide].

### 1.1. Components

The following components are required, and should be deployed in the standard manner per organizational practice. This may be a manual process, or may involve DevOps or infrastructure-as-code tooling. It is assumed that all instances are members of a `cloud.local` MAD domain, as outlined by the _AWS Secure Environment Architecture_.

#### 1.1.1. Remote Desktop Services

The following servers should be deployed as a standard **Remote Desktop Services** environment as described in the [following guide][guide]:

* An `rds-brk.cloud.local` (RD Broker, RD Licensing) server, running Windows Server 2019, deployed into the `App` subnet of a `Central` VPC in the _AWS Secure Environment Architecture_.
* An `rds-gateway.cloud.local` (RD Gateway) server, running Windows Server 2019, deployed into the `Web` subnet of a `Central` VPC in the _AWS Secure Environment Architecture_.

Note: The connection broker may be clustered for high-availability, but this may not be necessary for this use case.

#### 1.1.2. Remote Desktop Session Host(s)

An appropriate pool of remote desktop session hosts should be deployed. Highly available deployments require at least two hosts, deployed in separate availability zones (AZs).

* An `rds-host-01.cloud.local` (RDP Session) server, running Windows Server 2019, deployed into the `App` subnet of a `Central` VPC in the _AWS Secure Environment Architecture_.

Optionally, a group policy setting may be set on the session hosts to force logout after a low duration (e.g. 3 minutes) to free up the session hosts for other users.

#### 1.1.3. RD Web Access

The following server should be provisioned for web access:

* An `rds-web.cloud.local` (RD Web Access) server, running Windows Server 2019, deployed into the `Web` subnet of a `Central` VPC in the _AWS Secure Environment Architecture_.

As before, ensure a public certificate is provisioned. Note the [prerequisites][web-pre] specific to RD Web Access.

[web-pre]: https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/remote-desktop-web-client-admin#what-youll-need-to-set-up-the-web-client
[guide]: https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/rds-plan-and-design
[pool]: https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/rds-create-collection
[ingress]: https://social.technet.microsoft.com/wiki/contents/articles/16164.rds-2012-which-ports-are-used-during-deployment.aspx

#### 1.1.4. Security Group Ingress
The above components require a number of inbound TCP and UDP ports between components; these need to be permitted in the corresponding EC2 security group. Please refer to [this Microsoft TechNet article][ingress] for an elaboration of the necessary ingress rules.

#### 1.1.5. Remote Desktop Services Collection

Create a personal desktop session collection.

```powershell
New-RDSessionCollection -CollectionName Desktop `
                        -CollectionDescription "Desktop Publication" `
                        -SessionHost rds-host-01.cloud.local `
                        -ConnectionBroker rds-brk.cloud.local
```

Within Server Manager, the RemoteApps of the collection can be configured. Add a single low-privilege application, such as calc.exe.

### 1.2. Web Configuration

It is necessary to ensure the broker certificate is imported:

```powershell
Import-RDWebClientBrokerCert <.cer file path>
```

Then publish the Remote Desktop [web client][publish]:

```powershell
Install-RDWebClientPackage
Publish-RDWebClientPackage -Type Production -Latest
```

[publish]: https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/remote-desktop-web-client-admin#how-to-publish-the-remote-desktop-web-client


### 1.3. Password Resets
Password resets via RDWeb access needs to be enabled. Within IIS on `rds-web.cloud.local`, set `PasswordChangeEnabled` to `true` under `Default Web Site/RDweb/Pages > Application Settings`.

Users can now navigate to `/Rdweb/Pages/en-us/password.aspx` on `rds-web.cloud.local` to initiate a password reset.

### 1.4. Perimeter Network / Load Balancer

Access to the RDWeb instance in the `Web` subnet of the `Central` VPC from an on-premises network can be configured in the standard manner for the _AWS Secure Environment Architecture_ (i.e. via the Perimeter network and NGFW appliances, and with traffic forwarded to an Application Load Balancer in the `Central` VPC from the NGFW). The NGFW routing rules should enforce on-prem connectivity only for these connections.


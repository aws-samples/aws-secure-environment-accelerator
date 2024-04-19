# 1. CA-West-1 (Calgary) Region Configurations and Customizations

## 1.1. Summary
The configurations described in this documentation section explains how to enable the Calgary (ca-west-1) region. This currently depends on ASEA version > 1.6.1, and extends into ca-west-1 (i.e. ca-west-1 is NOT the home region). Before applying any of the configuration below, be sure to review the networking architecture, and deploy in a test ASEA instance first if possible. 


## 1.2. Network Architecture -- Mirrored from Home Region
![Mirrored ca-west-1 Networking](./img/mirrored-ca-west-1-network.png)

The _Mirrored from Home Region_ network architecture mirrors the network architecture from the home region (e.g. ca-central-1). In the diagram above, ca-west-1 has its own Transit Gateway, same set of VPCs, Endpoint configuration, and Perimeter VPC/Firewall configuration. Additionaly, this configuration sample does not connect ca-central-1 with ca-west-1 via Transit Gateway Peering (see #1.3 below). Note that in the sample config provided, the IP CIDR ranges are different than the home region. 

## 1.3. Network Architecture -- Cross Region Peering
(coming soon)
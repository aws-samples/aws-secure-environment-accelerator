# AWS Secure Environment Accelerator

## **Deployment Customizations**

### - Link to the sample PBMM config [file](../../reference-artifacts/config.example.json)

### - Link to the light weight sample PBMM config [file](../../reference-artifacts/config.lite-example.json) **_ Recommended for most new AWS customers _**

- The full PBMM configuration file was based on feedback from customers moving into AWS at scale and at a rapid pace. Customers of this nature have indicated that they do not want to have to upsize their perimeter firewalls or add Interface endpoints as their developers start to use new AWS services. As these are the two most expensive components of the solution, this does not fit all customers needs, so we created a light weight version of the configuration file that does not sacrifice functionality, but could limit performance. This config file:
  - only deploys the 6 required centralized Interface Endpoints (removes 56)
    - all services remain accessible using the AWS public endpoints, but require traversing the perimeter firewalls
  - removes the perimeter VPC Interface Endpoints
  - removes the Fortigate Manager appliance deployment
  - reduces the Fortigate instance sizes from c5n.2xl to c5n.xl (VM08 to VM04)
  - removes the Unclass ou and VPC
- The Accelerator allows customers to easily add this functionality in future, as and when required without any impact

### - [Multi-file Accelerator config file option and YAML support](./multi-file-config-capabilities.md)

### - [Additional config file parameters not shown in primary sample config file](../../reference-artifacts/master-config-sample-snippets/sample_snippets.md)

### - 3rd Party Firewall

- Sample firewall config [file](../../reference-artifacts/Third-Party/firewall-example.txt)
- Firewall configuration [customizations](../../reference-artifacts/master-config-sample-snippets/firewall_file_available_variables.md)

### - Other Sample Accelerator Configuration Files

- [Future](.)
- [Future](.)

---

[...Return to Accelerator Table of Contents](../index.md)

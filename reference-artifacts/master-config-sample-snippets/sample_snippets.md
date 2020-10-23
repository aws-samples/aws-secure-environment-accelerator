# AWS Secure Environment Accelerator

## **Config File Sample Snippets (Parameters not in sample config file)**

---

- Creates DNS query logging and associate to the VPC

```
    "vpc": {
	  "dns-resolver-logging": true
    }
```

---

- Update Central Logging Kinesis stream shard count as accounts are added

```
    "central-log-services": {
	  "kinesis-stream-shard-count": 2
    }
```

---

- Override default CWL retention period (Add to any account)

```
     “cwl-retention”: 180
```

---

- Valid options for vpc flow logs setting on each VPC

```
"flow-logs": "S3"  ---> S3, CWL, BOTH
```

---

- Macie Frequency Supported Values:

```
      "macie-frequency": "SIX_HOURS" ---> FIFTEEN_MINUTES, ONE_HOUR, SIX_HOURS
```

---

- CWL subscription exclusions example

```
    "central-log-services": {
      "cwl-glbl-exclusions": ["/xxx/yyy/*", "abc/*"],
      "cwl-exclusions": [
        {
          "account": "fun-acct",
          "exclusions": ["def/*"]
        }
      ]
	}
```

---

- CloudWatch Metric Filters and Alarms

```
  "global-options": {
      "cloudwatch": {
        "metrics": [{
            "filter-name": "SecurityGroupChangeMetricTest",
            "accounts": [
              "master"
            ],
            "regions": [
              "ca-central-1"
            ],
            "loggroup-name": "/PBMMAccel/CloudTrail",
            "filter-pattern": "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }",
            "metric-namespace": "CloudTrailMetrics",
            "metric-name": "SecurityGroupEventCountTest",
            "metric-value": "1",
            "default-value": 0
        }],
        "alarms": {
          "default-accounts": [
            "master"
          ],
          "default-regions": [
            "ca-central-1"
          ],
          "default-namespace": "CloudTrailMetrics",
          "default-statistic": "Sum",
          "default-period": 300,
          "default-threshold-type": "Static",
          "default-comparison-operator": "GreaterThanOrEqualToThreshold",
          "default-threshold": 1,
          "default-evaluation-periods": 1,
          "default-treat-missing-data": "notBreaching",
          "definitions": [{
              "alarm-name": "AWS-Security-Group-Changed",
              "metric-name": "SecurityGroupEventCount",
              "sns-alert-level": "Low",
              "alarm-description": "Alarms when one or more API calls are made to create, update or delete a Security Group (in any account, any region of your AWS Organization)."
          }]
        }
      }
    }
```

---

- Additional regions for Amazon CloudWatch Central Logging to S3

```
    "additional-cwl-regions": {
      "us-east-1": {
        "kinesis-stream-shard-count": 1
      }
    }
```

---

- SNS Topics - If section not provided we create High,Medium,Low,Ignore SNS topics with out subscribers

```
    "central-log-services": {
      "sns-excl-regions": ["sa-east-1"],
      "sns-subscription-emails": {
        "High": ["notify+high@example.com"],
        "Low": ["notify+low@example.com"],
        "Medium": ["notify+medium@example.com"]
      }
    }
```

---

- Cert REQUEST format (Import shown in sample)

```
      "certificates": [
        {
          "name": "PublicCert",
          "type": "request",
          "domain": "*.example.com",
          "validation": "DNS",
          "san": ["*.example1.com"]
        }
      ]
```

---

- Other Budget "include" fields

```
      "default-budgets": {
        "name": "Default Core Budget",
        "period": "Monthly",
        "amount": 1000,
        "include": [
          "Refunds",
          "Credits",
          "Upfront-reservation-fees",
          "Recurring-reservation-charges",
          "Other-subscription-costs",
          "Taxes",
          "Support-charges",
          "Discounts"
		]
	  }
```

---

- Cross Account Role Example

```
          {
            "role": "Test-Role",
            "type": "account",
            "policies": ["AdministratorAccess"],
            "boundary-policy": "Default-Boundary-Policy",
            "source-account": "security",
            "source-account-role": "AWSLandingZoneSecurityAdministratorRole",
            "trust-policy": "role-trust-policy.txt"
          }
```

---

- Very basic workload account example and "per account" exceptions example

```
  "workload-account-configs": {
    "fun-acct": {
      "account-name": "TheFunAccount",
      "email": "myemail+pbmmT-funacct@example.com---------------------REPLACE----------------------",
      "ou": "Sandbox",
      "exclude-ou-albs": true
    },
    "mydevacct1": {
      "account-name": "MyDev1",
      "email": "myemail+pbmmT-dev1@example.com---------------------REPLACE----------------------",
      "ou": "Dev",
      "share-mad-from": "operations",
      "enable-s3-public-access": true,
      "keep-default-vpc-regions": []
    }
  }
```

---

- Sample limit increases supported

```
      "limits": {
        "Amazon VPC/Interface VPC endpoints per VPC": 90,
        "Amazon VPC/VPCs per Region": 15,
        "AWS CloudFormation/Stack count": 400,
        "AWS CloudFormation/Stack sets per administrator account": 400
      }
```

---

- v1.0.4_to_v1.0.5 upgrade MAD fix - REQUIRED ALL 1.0.4 ORIGINAL INSTALLS

```
      "deployments": {
        "mad": {
          "password-secret-name": "accelerator/operations/mad/password"
	    }
	  }
```

---

- Sample Complex Security Group

```
          {
            "name": "SampleComplexSecurityGroup",
            "inbound-rules": [
              {
                "description": "Allow Inbound Domain Traffic",
                "tcp-ports": [464, 389, 3389, 445, 88, 135, 636, 53],
                "udp-ports": [445, 138, 464, 53, 389, 123, 88],
                "source": ["0.0.0.0/0"]
              },
              {
                "description": "Allow Inbound RDSH",
                "type": ["TCP"],
                "toPort": 3269,
                "fromPort": 3268,
                "source": ["0.0.0.0/0"]
              },
              {
                "description": "Allow Inbound High Ports",
                "type": ["TCP"],
                "toPort": 65535,
                "fromPort": 1024,
                "source": ["0.0.0.0/0"]
              }
            ],
            "outbound-rules": [
              {
                "description": "All Outbound",
                "type": ["ALL"],
                "source": ["0.0.0.0/0", "0::/0"]
              }
            ]
          },
```

---

- Sample Single AZ NATGW

```
"natgw": {
    "subnet": {
      "name": "Web",
      "az": "a"
    }
  },
  "subnets": [
    {
      "name": "Web",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.32.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.128.0/20"
        }
      ]
    },
    {
      "name": "App",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.0.0/19"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.96.0/19"
        }
      ]
    },
    {
      "name": "Data",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.48.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.144.0/20"
        }
      ]
    }
  ],
  "route-tables": [
    {
      "name": "SandboxVPC_IGW",
      "routes": [
        {
          "destination": "0.0.0.0/0",
          "target": "IGW"
        }
      ]
    },
    {
      "name": "SandboxVPC_Common",
      "routes": [
        {
          "destination": "0.0.0.0/0",
          "target": "NATGW_Web_azA"
        }
      ]
    }
  ]
```

---

- Sample PER AZ NATGW

```
"natgw": {
    "subnet": {
      "name": "Web"
    }
  },
  "subnets": [
    {
      "name": "Web",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.32.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.128.0/20"
        }
      ]
    },
    {
      "name": "App",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_a",
          "cidr": "10.6.0.0/19"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_b",
          "cidr": "10.6.96.0/19"
        }
      ]
    },
    {
      "name": "Data",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_a",
          "cidr": "10.6.48.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_b",
          "cidr": "10.6.144.0/20"
        }
      ]
    }
  ],
  "route-tables": [
    {
      "name": "SandboxVPC_IGW",
      "routes": [
        {
          "destination": "0.0.0.0/0",
          "target": "IGW"
        }
      ]
    },
    {
      "name": "SandboxVPC_a"
    },
    {
      "name": "SandboxVPC_b"
    }
  ]
```

---

- Sample NATGW - NOT PREFERED, but works: (uses first AZ)

```
"natgw": {
    "subnet": {
      "name": "Web"
    }
  },
  "subnets": [
    {
      "name": "Web",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.32.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_IGW",
          "cidr": "10.6.128.0/20"
        }
      ]
    },
    {
      "name": "App",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.0.0/19"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.96.0/19"
        }
      ]
    },
    {
      "name": "Data",
      "share-to-ou-accounts": false,
      "share-to-specific-accounts": [],
      "definitions": [
        {
          "az": "a",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.48.0/20"
        },
        {
          "az": "b",
          "route-table": "SandboxVPC_Common",
          "cidr": "10.6.144.0/20"
        }
      ]
    }
  ],
  "route-tables": [
    {
      "name": "SandboxVPC_IGW",
      "routes": [
        {
          "destination": "0.0.0.0/0",
          "target": "IGW"
        }
      ]
    },
    {
      "name": "SandboxVPC_Common",
      "routes": [
        {
          "destination": "0.0.0.0/0",
          "target": "NATGW_Web_azA"
        }
      ]
    }
  ]
```

---

- TGW Route tables plus Multiple TGWs

```
        "tgw": [
          {
            "name": "Main",
            "asn": 65521,
            "region": "ca-central-1",
            "features": {
              "DNS-support": true,
              "VPN-ECMP-support": true,
              "Default-route-table-association": false,
              "Default-route-table-propagation": false,
              "Auto-accept-sharing-attachments": true
            },
            "route-tables": ["core", "segregated", "shared", "standalone"],
            "tgw-routes": [
              {
                "name": "{TGW_ALL}",
                "routes": [
                  {
                    "destination": "1.1.0.0/32",
                    "target-tgw": "East"
                  }
                ]
              },
              {
                "name": "segregated",
                "routes": [
                  {
                    "destination": "1.0.4.0/32",
                    "blackhole-route": true
                  }
                ]
              },
              {
                "name": "shared",
                "routes": [{
                  "destination": "1.0.2.0/32",
                  "target-vpc": "Dev"
                }]
              },
              {
                "name": "standalone",
                "routes": [{
                  "destination": "1.0.3.0/32",
                  "target-vpn": {
                    "name": "Perimeter_fw",
                    "az": "b",
                    "subnet": "Public"
                  }
                }]
              }
            ]
          },
          {
            "name": "East",
            "asn": 64526,
            "region": "us-east-1",
            "features": {
              "DNS-support": true,
              "VPN-ECMP-support": true,
              "Default-route-table-association": false,
              "Default-route-table-propagation": false,
              "Auto-accept-sharing-attachments": true
            },
            "route-tables": ["core", "segregated", "shared", "standalone"],
            "tgw-attach": {
              "associate-to-tgw": "Main",
              "account": "shared-network",
              "region": "ca-central-1",
              "tgw-rt-associate-local": ["core"],
              "tgw-rt-associate-remote": ["core"]
            },
            "tgw-routes": [
              {
                "name": "core",
                "routes": [
                  {
                    "destination": "1.1.0.0/32",
                    "target-tgw": "Main"
                  }
                ]
              },
              {
                "name": "segregated",
                "routes": [
                  {
                    "destination": "1.1.1.0/32",
                    "target-tgw": "Main"
                  }
                ]
              }
            ]
          }
        ]
```

---

- Creating a VPC Virtual Gateway
```
          "vgw": {
            "asn": 65522
          },
```

---

- Future description
```
{future sample}
```

---

[...Return to Customization Table of Contents](../../docs/installation/customization-index.md)

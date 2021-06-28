## SEA Custom Script to prepare for upgrade from v1.3.3

usage: update.py [-h] [--AcceleratorPrefix ACCELERATORPREFIX] --ConfigFile
                 CONFIGFILE --Region REGION [--LoadDB] [--LoadConfig]

A Script to load existing cidrs to DDB Cidr Pool table and generate new config
based for upgrade

optional arguments:
  -h, --help            show this help message and exit
  --AcceleratorPrefix ACCELERATORPREFIX
                        The value set in AcceleratorPrefix
  --ConfigFile CONFIGFILE
                        ConfigFile location
  --Region REGION       Region in which SEA is deployed
  --LoadDB              Flag to enable load existing cidrs to DynamoDB Tables
  --LoadConfig          Flag to enable Conversion of config file from pervious
                        version

A Script to load existing cidrs to DDB Cidr Pool table and generate new config
based for upgrade

optional arguments:
  -h, --help            show this help message and exit
  --AcceleratorPrefix ACCELERATORPREFIX
                        The value set in AcceleratorPrefix
  --ConfigFile CONFIGFILE
                        ConfigFile location

```
    python update.py --ConfigFile=config.json
```


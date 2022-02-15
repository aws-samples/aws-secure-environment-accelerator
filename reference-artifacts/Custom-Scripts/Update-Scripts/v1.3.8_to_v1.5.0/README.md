## ASEA Custom Script to prepare for upgrade from v1.3.8 to v1.5.0

Usage:

```
update.py [-h] [--AcceleratorPrefix ACCELERATORPREFIX] [--CoreOU COREOUNAME]--ConfigFile
                 CONFIGFILE --Region REGION [--LoadDB] [--LoadConfig]
```

A Script to load existing cidrs to DDB Cidr Pool table and generate a new v1.5.0 config
file for an Accelerator upgrade. This script only supports single file json files.

Optional arguments:

```
  -h, --help            show this help message and exit
  --AcceleratorPrefix ACCELERATORPREFIX
                        The value set in AcceleratorPrefix
  --CoreOU COREOUNAME   Optional parameter. Defaults to core. The name of the core OU.
  --ConfigFile CONFIGFILE
                        ConfigFile location
  --Region REGION       Region in which SEA is deployed
  --LoadDB              Flag to enable load existing cidrs to DynamoDB Tables
  --LoadConfig          Flag to enable Conversion of config file from pervious
                        version
```

Examples:

- Update the config.json to the new v1.5.0 file format:

```
	python update.py --Region ca-central-1 --LoadConfig --ConfigFile config.json
```

- Load DynamoDB tables with currently utilized CIDR ranges:
  - Note: To properly set the pool values, execute against the updated (v1.5.0) config file

```
	python update.py --Region ca-central-1 --LoadDB --ConfigFile update-config.json --AcceleratorPrefix ASEA-
```

## SEA Custom Script to prepare for upgrade from v1.3.3

usage: update.py [-h] [--AcceleratorPrefix ACCELERATORPREFIX]
                 [--ConfigFile CONFIGFILE]

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


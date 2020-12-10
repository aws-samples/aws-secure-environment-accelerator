## AWS Config Rules Configuration generator script

This script takes cloudformation yaml/json for confermence packs as input and generates config rules configuration with respect to accelerator.


### Usage

``` 
usage: generate-config-rules.py [-h] --path PATH [--outputFormat {json,yaml}]
                                [--inputFormat {json,yaml}] 
```

### Example

```
    python generate-config-rules.py --path=/Users/Desktop/config --outputFormat=yaml
```



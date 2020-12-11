## AWS Config Rules Configuration generator script

This script take an AWS Conformance pack template (cloudformation yaml/json) found [here](https://docs.aws.amazon.com/config/latest/developerguide/conformancepack-sample-templates.html) as input and generates a configuration file containing the corresponding config rules and parameters formatted for consumption by the AWS Secure Environment Accelerator. 

### Usage

``` 
usage: generate-config-rules.py [-h] --path PATH [--outputFormat {json,yaml}]
                                [--inputFormat {json,yaml}] 
```

### Example

```
    python generate-config-rules.py --path=/Users/Desktop/config --outputFormat=yaml
```



## AWS SEA Multi-account Opt-In scripts

The Opt In script is intended to assist in automatically enabling or disabling AWS Opt-In regions for already existing accounts in an ASEA deployment.

The region must be manually enabled for the Management Account first and and [Trusted Access] (https://docs.aws.amazon.com/accounts/latest/reference/using-orgs-trusted-access.html) also enabled

## Details

The logic of the script is the following:

1. Intakes paramters for: Opt-In Region, Action, and ignored OUs

2. Queries the Management Account's AWS Organizations API for account and OU structure

3. Creates a structured list of account numbers

4. Launches multiple threads and executes the enable/disable action based on the paramters passed

## Instructions

1. Log into the AWS console as a Full Administrator to the Organization Management account.
2. Start a CloudShell session.
3. Copy the files from this folder to the CloudShell session;
4. Create a virtual python environment. `python3 -m venv env`
5. Activate the python environment. `source env/bin/activate`
6. Install the python3 required libaries (ex: `pip install -r requirements.txt`).
7. Make the Python script executable (ex: `chmod +x region_optin.py`).
8. Execute the script with the following parameters: 
    `--OptInRegion` *region*
    `--Action`      *enable / disable / status*
    
    Optional:
    `--IgnoreOU` *ou* 

    Example: `python3 region_optin.py --OptInRegion ca-west-1 --Action=enable`

## Requirements

-boto3
-autopep8
-other



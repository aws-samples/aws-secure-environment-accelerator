#!/usr/bin/env python

import os
import boto3
import botocore
import json
import threading
import time
import sys
import argparse
import base64
from tabulate import tabulate
from os import path


parser = argparse.ArgumentParser(
        description="A development script that cleans up resources deployed by the accelerator. Use Administrator AWS credentials in the master account when running this script."
)

organizations = boto3.client("organizations")
sts = boto3.client("sts")

def get_accounts():
    print("Accounts:")
    aws_accounts = organizations.list_accounts()
    tmp = map(lambda x: [x["Id"], x["Name"]], aws_accounts["Accounts"])
    
    print(tabulate(list(tmp), headers=["Id", "Name"]))

    return aws_accounts["Accounts"]

def build_stack_data(accounts, regions, admin_role_name, master_account_name):
    print("Stacks:")

    result = {}
    result["Accounts"] = []
    result["Regions"] = regions

    all_stacks = {}

    for account in accounts:
        cloudformation = None
       
        roleArn = "arn:aws:iam::{accountId}:role/{roleName}".format(accountId=account["Id"], roleName=admin_role_name)
        
        result["Accounts"].append(
            {
                "AccountId": account["Id"],
                "AccountName": account["Name"],
                "AdminRoleArn": roleArn
            }
        )

        credentials = sts.assume_role(
            RoleArn=roleArn,
            RoleSessionName="AcceleratorCleanupScript"
        )

        region_stacks = {}

        for region in regions:            
            cloudformation = boto3.client("cloudformation", 
                region_name=region,
                aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
                aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
                aws_session_token=credentials["Credentials"]["SessionToken"]
            )
            stacks = cloudformation.list_stacks(
                StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE']            
            )
            region_stacks[region] = list(map(lambda x: {"StackName":x["StackName"],"StackId":x["StackId"]}, stacks["StackSummaries"]))
            tmp = map(lambda x: [x["StackName"], "True" if "ParentId" in x else "", region, account["Id"]], stacks["StackSummaries"])
            print(tabulate(list(tmp), headers=["StackName", "IsNested", "Region", "AccountId"]))
            
            print()
          

        all_stacks[account["Id"]] = region_stacks

    result["AllStacks"] = all_stacks
   
    with open('stacks.json', 'w') as outfile:
        json.dump(result, outfile)
        
    return all_stacks


def process_delete(all_stacks):
    phases = [        
        "-Phase5",
        "-Phase4",
        "-Phase3",
        "-Phase2",
        "-Phase1",
        "-Phase0",
        "-Phase-1",
        "-InitialSetup"
    ]

    # Process one phase at a time, but to all accounts through all regions
    # For each Phase
    #  For each Account
    #   For each Region
    #     Look for a stack with name ending in the phase. What status is it in?
    #     Does it contain any S3 buckets? If yes, delete them first
    # Wait until all done
    
    for phase in phases:
        print("Processing '{}'".format(phase))
        threads = list()
        try:
            for account in all_stacks["Accounts"]:
                #print("\tProcessing '{}'".format(account["AccountId"]))
                 
                for region in all_stacks["Regions"]:
                    #print("\t\tProcessing '{}'".format(region))

                    for stack in all_stacks["AllStacks"][account["AccountId"]][region]:                        
                        if stack["StackName"].endswith(phase):
                            print("\tProcessing '{}' in {} {}".format(stack["StackName"], account["AccountId"], region))
                            t = threading.Thread(target=thread_cloudformation_delete, args=(phase, region, stack["StackId"], account["AdminRoleArn"],))
                            threads.append(t)
                            t.start()
        except:
            print("Error!", sys.exc_info()[0], "occurred.")
        finally:
            print("Waiting for all threads to finish")
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done waiting for all threads to finish.")
             
        print("Done")

   
    
             



def thread_cloudformation_delete(phase, region, stackid, admin_role):
    
 
    sts = boto3.client("sts")
    
    try:
        credentials = sts.assume_role(
            RoleArn=admin_role,
            RoleSessionName="AcceleratorCleanupScript"
        )

        cloudformation = boto3.client("cloudformation", 
                region_name=region,
                aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
                aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
                aws_session_token=credentials["Credentials"]["SessionToken"]
        )

        #Are there any S3 buckets?
        resources = cloudformation.describe_stack_resources(StackName=stackid)

        for resource in resources["StackResources"]:
            if resource["ResourceType"] == "AWS::S3::Bucket":
                #delete all bucket contents first
                print("S3 Bucket Resource '{}'".format(resource["PhysicalResourceId"]))
                delete_s3_bucket(region, credentials["Credentials"], resource["PhysicalResourceId"])


        stack = cloudformation.describe_stacks(
            StackName=stackid
        )

        for index, s in enumerate(stack["Stacks"]):
            stack_name = s["StackId"]
            
            if s["StackStatus"] != "DELETE_COMPLETE":
                print("Deleting Stack Region: {}, StackName: {}, StackStatus: {}".format( region, stack_name, s["StackStatus"]))
           
                cloudformation.update_termination_protection(           
                    EnableTerminationProtection=False,
                    StackName=stack_name
                )

                waiter = cloudformation.get_waiter('stack_delete_complete')

                cloudformation.delete_stack(StackName=stack_name)

                waiter.wait(StackName=stack_name)

                #Did the stack delete fail?
                stack_failed = stack_exists(cloudformation, stack_name, 'DELETE_FAILED')

                print("Done. Deleting Stack Region: {}, StackName: {}, StackStatus: {}".format( region, stack_name, s["StackStatus"]))

               

    except botocore.exceptions.ClientError as err:
        print('Error Message: {}'.format(err.response['Error']['Message']))


def stack_exists(client, name, required_status = 'CREATE_COMPLETE'):
    try:
        data = client.describe_stacks(StackName = name)
    except botocore.exceptions.ClientError:
        return False
    return data['Stacks'][0]['StackStatus'] == required_status

def delete_s3_bucket(region, account_credentials, bucket_name):
    s3 = boto3.resource('s3', 
        region_name=region, 
        aws_access_key_id=account_credentials['AccessKeyId'], 
        aws_secret_access_key=account_credentials['SecretAccessKey'], 
        aws_session_token=account_credentials['SessionToken']
    )
    s3_bucket = s3.Bucket(bucket_name)
    if s3_bucket in s3.buckets.all():
        print("Emptying bucket (this may take a while) {}".format(bucket_name))
        s3_bucket.object_versions.all().delete()
        
        print("Done. Emptying bucket (this may take a while) {}".format(bucket_name))
                            
        print('Deleting bucket {}'.format(bucket_name))
        try:
            s3_bucket.delete()
            print('Done. Deleting bucket {}'.format(bucket_name))
           
        except botocore.exceptions.ClientError as e:
            print("Error while trying to delete S3 bucket {}, it should be empty by now so if you see BucketNotEmpty check the bucket in AWS console and delete it manually")
             

def delete_scps(credentials, region):
    organizations = boto3.client("organizations", 
            region_name=region,
            aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=credentials["Credentials"]["SessionToken"]
        )

    scps = organizations.list_policies(
        Filter='SERVICE_CONTROL_POLICY'    
    )

    print("Deleting SCPs...")

    for scp in scps["Policies"]:
        scp_name = scp["Name"]
        if scp_name.startswith("PBMMAccel"):
            print("Detaching SCP '{}'".format(scp["Name"]))
            targets = organizations.list_targets_for_policy(PolicyId=scp["Id"])

            for target in targets["Targets"]:
                organizations.detach_policy(
                    PolicyId=scp["Id"],
                    TargetId=target["TargetId"]
                )
            print("Done. Detaching SCP '{}'".format(scp["Name"]))

            print("Deleting SCP '{}'".format(scp["Name"]))
            
            organizations.delete_policy(
                PolicyId=scp["Id"]
            )
            print("Done. Deleting SCP '{}'".format(scp["Name"]))    

    print("Done. Deleting SCPs...")   


def master_cleanup(credentials, region):
    print("delete stack sets")
   

    cloudformation = boto3.client("cloudformation", 
            region_name=region,
            aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=credentials["Credentials"]["SessionToken"]
        )

    stacksets = cloudformation.list_stack_sets()

    for stackset in stacksets["Summaries"]:
        name = stackset["StackSetName"]
        if name.startswith("PBMMAccel"):
            instances = cloudformation.list_stack_instances(StackSetName=name)
            instances_accounts = list(map(lambda x: x["Account"], instances["Summaries"]))
            instances_regions = list(set(map(lambda x: x["Region"], instances["Summaries"])))

            if len(instances_accounts) > 0:
                cloudformation.delete_stack_instances(
                    StackSetName=name,
                    RetainStacks=False,
                    Accounts=instances_accounts,
                    Regions=instances_regions
                )

                while True:
                    instances = cloudformation.list_stack_instances(StackSetName=name)
                    num = len(instances["Summaries"])

                    print("Instances left: {}".format(num))
                    if num == 0:
                        break
                    time.sleep(15)

            waiter = cloudformation.get_waiter('stack_delete_complete')
            cloudformation.delete_stack(StackName=name)

            waiter.wait(StackName=name)

            print("Done. Stack {} deleted".format(name))


    cloud_trail_name = "PBMMAccel-Org-Trail"
    cloudtrail = boto3.client("cloudtrail", 
            region_name=region,
            aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=credentials["Credentials"]["SessionToken"]
    )

    print("Deleting {}".format(cloud_trail_name))
    try:
        cloudtrail.delete_trail(Name=cloud_trail_name)
        print("Done. Deleting {}".format(cloud_trail_name))
    except botocore.exceptions.ClientError as err:
        print('Error Message: {}'.format(err.response['Error']['Message']))

    delete_scps(credentials, region)



def cleanup():
    print("cleanup")
    supported_regions = []
    admin_role = ""
    master_account_name = ""
    master_region = ""
    security_account_name = ""
    isALZorCT = False
    with open('config.json') as json_file:
        config = json.load(json_file)
        supported_regions = config["global-options"]["supported-regions"]
        admin_role = config["global-options"]["organization-admin-role"]
        config_master_account_name = config["global-options"]["aws-org-master"]["account"]
        master_region = config["global-options"]["aws-org-master"]["region"]

        config_security_account_name = config["global-options"]["central-security-services"]["account"]
        
        master_account_name = config["mandatory-account-configs"][config_master_account_name]["account-name"]
        security_account_name = config["mandatory-account-configs"][config_security_account_name]["account-name"]

        isALZorCT = config["global-options"]["alz-baseline"] or config["global-options"]["alz-baseline"]

    if isALZorCT:
        print("This cleanup script is designed to retract all components deployed in the accelerator and is intended for development use. It isn't tested for cleanup with baseline configurations.")
        return

    print("MasterAccount: {}", master_account_name)    

    all_stacks = None

    if path.exists("stacks.json"):
        print("Loading stacks.json...")
         
        with open('stacks.json') as stacks_json_file:
            all_stacks = json.load(stacks_json_file)     

        print("Done")       
    else:
        
        aws_accounts = get_accounts()

        all_stacks = build_stack_data(aws_accounts, supported_regions, admin_role, master_account_name)

        print("Review stacks.json")

        print("*** SSO must be cleaned up manually before continuing ***")
        return

   

    master_admin_arn_role = None
    for a in all_stacks["Accounts"]:
        if a["AccountName"] == master_account_name:
            master_admin_arn_role = a["AdminRoleArn"]

    master_credentials = sts.assume_role(
            RoleArn=master_admin_arn_role,
            RoleSessionName="AcceleratorCleanupScript"
    )


    cleanup_route53_resolver_load_config()

    cleanup_directory_sharing_load_config()

    process_delete(all_stacks)
    
    master_cleanup(master_credentials, master_region)
        
    security_credentials = None   
    for a in all_stacks["Accounts"]:
        if a["AccountName"] == security_account_name:
            security_role_arn = a["AdminRoleArn"]
            security_credentials = sts.assume_role(
                    RoleArn=security_role_arn,
                    RoleSessionName="AcceleratorCleanupScript"
            )
            break
    
    if security_credentials is not None:
        cleanup_guardduty(master_credentials, security_credentials, master_region, security_account_name, all_stacks)
        cleanup_macie(master_credentials, security_credentials, master_region, security_account_name, all_stacks)

    cleanup_cwl(all_stacks)
    
    
def cleanup_macie(master_credentials, security_credentials, master_region, security_account_name, all_stacks):
    print("Cleaning up Macie")
    try:     

        security_account_id = None
        for a in all_stacks["Accounts"]:
            if a["AccountName"] == security_account_name:
                security_account_id = a["AccountId"]

        macie_master = boto3.client("macie2", 
            region_name=master_region,
            aws_access_key_id=master_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=master_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=master_credentials["Credentials"]["SessionToken"]
        )

        macie = boto3.client("macie2", 
            region_name=master_region,
            aws_access_key_id=security_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=security_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=security_credentials["Credentials"]["SessionToken"]
        )
                       
        for region in all_stacks["Regions"]:

            try:
                macie_r = boto3.client("macie2", 
                    region_name=region,
                    aws_access_key_id=security_credentials["Credentials"]["AccessKeyId"],
                    aws_secret_access_key=security_credentials["Credentials"]["SecretAccessKey"],
                    aws_session_token=security_credentials["Credentials"]["SessionToken"]
                )

                member_accounts = macie_r.list_members()
                 
                for member in member_accounts["members"]:
                    memberId = member["accountId"]
                    print("Disassociate Member {} {}".format(region, memberId))
                    macie_r.disassociate_member(id=memberId)
                    print("Delete Member {} {}".format(region, memberId))
                    macie_r.delete_member(id=memberId)
            except botocore.exceptions.ClientError as err:
                print('Error Message: {}'.format(err.response['Error']['Message']))

        threads = list()
        try:            
            for account in all_stacks["Accounts"]:                    
                for region in all_stacks["Regions"]:
                   
                    t = threading.Thread(target=thread_macie_delete, args=(region, account["AdminRoleArn"], account["AccountId"]))
                    threads.append(t)
                    t.start()
        finally:            
            print("Waiting for all threads to finish")
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done Join")

        try:
            macie_master.disable_organization_admin_account(
                adminAccountId=security_account_id
            )
        except botocore.exceptions.ClientError as err:
            print('Error Message: {}'.format(err.response['Error']['Message']))


                       
    except botocore.exceptions.ClientError as err:
        print('Error Message: {}'.format(err.response['Error']['Message']))


def thread_macie_delete(region, admin_role, accountId):

    sts = boto3.client("sts")

    try:
        credentials = sts.assume_role(
            RoleArn=admin_role,
            RoleSessionName="AcceleratorCleanupScript"
        )

        macie = boto3.client("macie2",
            region_name=region,
            aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=credentials["Credentials"]["SessionToken"]
        )

        print("Disabling macie in {} for {}".format(region, accountId))

      
        try:
            macie.disable_macie()
        except botocore.exceptions.ClientError as err:
            print('Error Message: {}'.format(err.response['Error']['Message']))
           

    except botocore.exceptions.ClientError as err:
        print('Disabling macie in {} for {}. Error Message: {}'.format(region, accountId, err.response['Error']['Message']))
        


    
def cleanup_guardduty(master_credentials, security_credentials, master_region, security_account_name, all_stacks):
    print("Cleaning up GuardDuty")
    try:     

        security_account_id = None
        for a in all_stacks["Accounts"]:
            if a["AccountName"] == security_account_name:
                security_account_id = a["AccountId"]

        guardduty_master = boto3.client("guardduty", 
            region_name=master_region,
            aws_access_key_id=master_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=master_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=master_credentials["Credentials"]["SessionToken"]
        )

      

        guardduty = boto3.client("guardduty", 
            region_name=master_region,
            aws_access_key_id=security_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=security_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=security_credentials["Credentials"]["SessionToken"]
        )
                       
        for region in all_stacks["Regions"]:

            try:
                guardduty_r = boto3.client("guardduty", 
                    region_name=region,
                    aws_access_key_id=security_credentials["Credentials"]["AccessKeyId"],
                    aws_secret_access_key=security_credentials["Credentials"]["SecretAccessKey"],
                    aws_session_token=security_credentials["Credentials"]["SessionToken"]
                )
                
                detectorIds = guardduty_r.list_detectors()

                print("GuardDuty Detectors {} {}".format(region, detectorIds["DetectorIds"]))

                for dId in detectorIds["DetectorIds"]:                    
                    member_accounts = guardduty_r.list_members(DetectorId=dId)
                
                    member_account_ids = list(map(lambda x: x["AccountId"], member_accounts["Members"]))
                    if len(member_account_ids) > 0:
                        print("GuardDuty Members {} {}".format(region, member_account_ids))
                        try:
                            guardduty_r.disassociate_members(
                                DetectorId=dId,
                                AccountIds=member_account_ids
                            )
                        except botocore.exceptions.ClientError as err:
                            print('Error Message: {}'.format(err.response['Error']['Message']))

                        try:
                            guardduty_r.delete_members(
                                DetectorId=dId,
                                AccountIds=member_account_ids
                            )
                        except botocore.exceptions.ClientError as err:
                            print('Error Message: {}'.format(err.response['Error']['Message']))
                    
                    guardduty_master_r = boto3.client("guardduty", 
                        region_name=region,
                        aws_access_key_id=master_credentials["Credentials"]["AccessKeyId"],
                        aws_secret_access_key=master_credentials["Credentials"]["SecretAccessKey"],
                        aws_session_token=master_credentials["Credentials"]["SessionToken"]
                    )

                    try:
                        print("Disabling organization admin account")
                        guardduty_master_r.disable_organization_admin_account(
                            AdminAccountId=security_account_id
                        )
                        print("Done. Disabling organization admin account")
                    except botocore.exceptions.ClientError as err:
                        print('Error Message: {}'.format(err.response['Error']['Message']))

                    print("Disabling guardduty in {} for {}".format(region, security_account_id))
                    try:
                        guardduty_r.delete_detector(DetectorId=dId)
                        print("Done. Disabling guardduty in {} for {}".format(region, security_account_id))
                    except botocore.exceptions.ClientError as err:
                        print('Error Message: {}'.format(err.response['Error']['Message']))

            except botocore.exceptions.ClientError as err:
                print('Error Message: {}'.format(err.response['Error']['Message']))
        
        threads = list()
        try:            
            for account in all_stacks["Accounts"]:                    
                for region in all_stacks["Regions"]:
                   
                    t = threading.Thread(target=thread_guardduty_delete, args=(region, account["AdminRoleArn"], account["AccountId"]))
                    threads.append(t)
                    t.start()
        finally:            
            print("Waiting for all threads to finish")
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done Join")

        try:
            print("Disabling organization admin account")
            guardduty_master.disable_organization_admin_account(
                AdminAccountId=security_account_id
            )
            print("Done. Disabling organization admin account")
        except botocore.exceptions.ClientError as err:
            print('Error Message: {}'.format(err.response['Error']['Message']))


                       
    except botocore.exceptions.ClientError as err:
        print('Error Message: {}'.format(err.response['Error']['Message']))


def thread_guardduty_delete(region, admin_role, accountId):

    sts = boto3.client("sts")

    try:
        credentials = sts.assume_role(
            RoleArn=admin_role,
            RoleSessionName="AcceleratorCleanupScript"
        )

        guardduty = boto3.client("guardduty",
            region_name=region,
            aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=credentials["Credentials"]["SessionToken"]
        )

        print("Disabling guardduty in {} for {}".format(region, accountId))

        try:
            detectorIds = guardduty.list_detectors()

            for dId in detectorIds["DetectorIds"]:
                guardduty.delete_detector(DetectorId=dId)
                print("Done. Disabling guardduty in {} for {}".format(region, accountId))

        except botocore.exceptions.ClientError as err:
            print('Error Message: {}'.format(err.response['Error']['Message']))
           
    except botocore.exceptions.ClientError as err:
        print('Disabling macie in {} for {}. Error Message: {}'.format(region, accountId, err.response['Error']['Message']))
        

def cleanup_cwl(all_stacks):
    
    threads = list()
    try:            
        for account in all_stacks["Accounts"]:
            for region in all_stacks["Regions"]:
                t = threading.Thread(target=thread_cwl_cleanup, args=(region, account["AdminRoleArn"], account["AccountId"]))
                threads.append(t)
                t.start()
    finally:            
        print("Waiting for all threads to finish")
        for index, thread in enumerate(threads):            
            thread.join()
        print("Done Join")         
            

def thread_cwl_cleanup(region, admin_role_arn, accountId):

    sts = boto3.client("sts")

    credentials = sts.assume_role(
            RoleArn=admin_role_arn,
            RoleSessionName="AcceleratorCleanupScript"
    )

    cwl = boto3.client("logs", 
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )

    log_groups = cwl.describe_log_groups()

    while True:

        for log_group in log_groups["logGroups"]:
            if "PBMMAccel-" in log_group["logGroupName"]:
                print("Deleting log group '{}' in {} for {}".format(log_group["logGroupName"], region, accountId))
                cwl.delete_log_group(logGroupName=log_group["logGroupName"])
                print("Deleting log group '{}' in {} for {}".format(log_group["logGroupName"], region, accountId))

        if "nextToken" in log_groups and log_groups["nextToken"] is not None:
            log_groups = cwl.describe_log_groups(nextToken=log_groups["nextToken"])
        else:
            break




def cleanup_route53_resolver(credentials, region):
    print("cleanup_route53_resolver")
   
    client = boto3.client("route53resolver",
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )
   
  
    associations = client.list_resolver_rule_associations()

    for association in associations["ResolverRuleAssociations"]:
        if "Name" in association and association["Name"] == "System Rule Association":
            continue
        
        try:
            print("Disassociating ResolverRule '{}' for VPC '{}'".format(association["ResolverRuleId"], association["VPCId"]))
            client.disassociate_resolver_rule(
                VPCId=association["VPCId"],
                ResolverRuleId=association["ResolverRuleId"]
            )
            print("Done. Disassociating ResolverRule '{}' for VPC '{}'".format(association["ResolverRuleId"], association["VPCId"]))
        except botocore.exceptions.ClientError as err:
            print('Error Message: {}'.format(err.response['Error']['Message']))


    resolver_rules = client.list_resolver_rules()

    for resolver_rule in resolver_rules["ResolverRules"]:
        for resolver_rule in resolver_rules["ResolverRules"]:
            if resolver_rule["OwnerId"] != "Route 53 Resolver":
                try:
                    print("Deleting ResolverRule '{}'".format(resolver_rule["Id"]))
                    client.delete_resolver_rule(
                        ResolverRuleId=resolver_rule["Id"]
                    )
                    print("Done. Deleting ResolverRule '{}'".format(resolver_rule["Id"]))
                except botocore.exceptions.ClientError as err:
                    print('Error Message: {}'.format(err.response['Error']['Message']))

    print("Done. cleanup_route53_resolver")


def cleanup_directory_sharing(credentials, region, mad_dns_domain):
   
    client = boto3.client("ds",
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )

    directories = client.describe_directories()

    for directory in directories["DirectoryDescriptions"]:        
        if directory["Name"] == mad_dns_domain:
            
            shared_directories = client.describe_shared_directories(
                OwnerDirectoryId=directory["DirectoryId"]
            )
            
            for shared_directory in shared_directories["SharedDirectories"]:
                try:
                    print("Unsharing directory {} to {}".format(directory["DirectoryId"], shared_directory["SharedAccountId"]))
                    client.unshare_directory(
                        DirectoryId=directory["DirectoryId"],
                        UnshareTarget={
                            'Id': shared_directory["SharedAccountId"],
                            'Type': 'ACCOUNT'
                        }
                    )
                    print("Done. Unsharing directory {} to {}".format(directory["DirectoryId"], shared_directory["SharedAccountId"]))
                except botocore.exceptions.ClientError as err:
                    print('Error Message: {}'.format(err.response['Error']['Message']))            

  




def cleanup_directory_sharing_load_config():
    print("cleanup_directory_sharing")

    mad_account = ""    
    admin_role = ""
    master_region = ""
    mad_dns_domain = ""

    with open('config.json') as json_file:
        config = json.load(json_file)       

        admin_role = config["global-options"]["organization-admin-role"]        
        master_region = config["global-options"]["aws-org-master"]["region"]

        mad_account_name = config["global-options"]["central-operations-services"]["account"]
        mad_account =  config["mandatory-account-configs"][mad_account_name]["account-name"]
        mad_dns_domain  =  config["mandatory-account-configs"][mad_account_name]["deployments"]["mad"]["dns-domain"]
        
        
    accounts = get_accounts()

    # find the cenral_resolver_rule_account
    mad_account_id = None
    for account in accounts:
        if account["Name"] == mad_account:            
            mad_account_id = account["Id"]
            break
    
    if mad_account_id is not None:
        mad_account_creds = sts_credentials(mad_account_id, admin_role)
        cleanup_directory_sharing(mad_account_creds, master_region, mad_dns_domain)


    #Cleanup AD Connector in master account
    cleanup_ad_connectors(master_region, mad_dns_domain)

    print("Done. cleanup_directory_sharing")

def cleanup_ad_connectors(region, mad_dns_domain):
    client = boto3.client("ds",
        region_name=region
    )

    directories = client.describe_directories()

    for directory in directories["DirectoryDescriptions"]:        
        if directory["Name"] == mad_dns_domain:
            print("Cleaning up {}".format(directory["Name"]))
            client.delete_directory(
                DirectoryId=directory["DirectoryId"]
            )
            print("Done.Cleaning up {}".format(directory["Name"]))
            


def cleanup_route53_resolver_load_config():

    central_resolver_rule_account = ""    
    master_account_name = ""
    admin_role = ""
    master_region = ""

    with open('config.json') as json_file:
        config = json.load(json_file)
        
        admin_role = config["global-options"]["organization-admin-role"]        
        master_region = config["global-options"]["aws-org-master"]["region"]

        central_account_name = config["global-options"]["central-operations-services"]["account"]
        central_resolver_rule_account =  config["mandatory-account-configs"][central_account_name]["deployments"]["mad"]["central-resolver-rule-account"]
        
        config_master_account_name = config["global-options"]["aws-org-master"]["account"]
        master_account_name = config["mandatory-account-configs"][config_master_account_name]["account-name"]

    accounts = get_accounts()

    # find the cenral_resolver_rule_account
    central_resolver_rule_account_id = None
    for account in accounts:
        if account["Name"] == central_resolver_rule_account:
            print("Found {}".format(central_resolver_rule_account))
            central_resolver_rule_account_id = account["Id"]
            break
    
    if central_resolver_rule_account_id is not None:
        central_resolver_rule_account_creds = sts_credentials(central_resolver_rule_account_id, admin_role)
        cleanup_route53_resolver(central_resolver_rule_account_creds, master_region)


def sts_credentials(accountId, roleName):
    
    role_arn = "arn:aws:iam::{accountId}:role/{roleName}".format(accountId=accountId, roleName=roleName)
    
    sts = boto3.client("sts")
    credentials = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName="AcceleratorCleanupScript"
    )

    return credentials


def backup_config():
    cc = boto3.client('codecommit')

    repos = cc.list_repositories()
    backed_up = False
 
    if not path.exists("config.json"):
        print("Backing up config.json from CodeCommit...")
        try:
            for repo in repos["repositories"]:
                if repo["repositoryName"].startswith("PBMM"):
                    file = cc.get_file(
                        repositoryName=repo["repositoryName"],
                        filePath='/config.json'
                    )
                    with open("config.json", "w", encoding="utf-8") as outfile:
                        outfile.write(file["fileContent"].decode("utf-8"))
                        backed_up = True
                        break

        finally:
            if backed_up:
                print("Done backing up config.json from CodeCommit.")
            else:
                print("config.json NOT backed up.")



def configure_args(): 
    parser.parse_args()

if __name__ == "__main__":
    configure_args()
    backup_config()
    cleanup()
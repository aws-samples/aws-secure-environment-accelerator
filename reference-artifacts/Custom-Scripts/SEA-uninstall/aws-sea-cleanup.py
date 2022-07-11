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
import re
from tabulate import tabulate
from os import path


parser = argparse.ArgumentParser(
        description="A development script that cleans up resources deployed by the accelerator. Use Administrator AWS credentials in the root account when running this script."
)
parser.add_argument('--AcceleratorPrefix', default='ASEA', help='The value set in AcceleratorPrefix')
parser.add_argument('--HomeRegion', help='The home region you deployed ASEA to')
parser.add_argument('--GblRegion', default='us-east-1', help='The home region you deployed ASEA to')

def replacements(params):
    with open('config.json', 'r') as config:
        configData = config.read()
        if 'HomeRegion' in params:
            configData = configData.replace('${HOME_REGION}', params['HomeRegion'])
        else:
            print('You need to set --HomeRegion')
            sys.exit(1)
        if 'GblRegion' in params:
            configData = configData.replace('${GBL_REGION}', params['GblRegion'])
        config.close()

    with open('config.json', 'w') as config:
        config.write(configData)

organizations = boto3.client("organizations")
sts = boto3.client("sts")

def get_accounts():
    print("Accounts:")
    all_aws_accounts = []
    paginator = organizations.get_paginator('list_accounts')
    page_iterator = paginator.paginate()
    for aws_accounts in page_iterator:
        active_accounts = list(filter(lambda x: (x['Status'] == "ACTIVE"), aws_accounts["Accounts"]))
        tmp = map(lambda x: [x["Id"], x["Name"]], active_accounts)
    
        print(tabulate(list(tmp), headers=["Id", "Name"]))
        
        all_aws_accounts = all_aws_accounts + list(aws_accounts["Accounts"])

    return all_aws_accounts

def build_stack_data(accounts, regions, admin_role_name, root_account_name):
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
            print("Processing {} - {}".format(account["Name"], region))
            cloudformation = boto3.client("cloudformation", 
                region_name=region,
                aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
                aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
                aws_session_token=credentials["Credentials"]["SessionToken"]
            )
            stacks = cloudformation.list_stacks(
                StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'DELETE_FAILED', 'DELETE_IN_PROGRESS', 'ROLLBACK_COMPLETE', 'ROLLBACK_FAILED']
            )
            region_stacks[region] = list(map(lambda x: {"StackName":x["StackName"],"StackId":x["StackId"], "StackStatus":x["StackStatus"]}, stacks["StackSummaries"]))
            tmp = map(lambda x: [x["StackName"], "True" if "ParentId" in x else "", region, account["Id"], x["StackStatus"]], stacks["StackSummaries"])
            print(tabulate(list(tmp), headers=["StackName", "IsNested", "Region", "AccountId", "StackStatus"]))
            
            print()
          

        all_stacks[account["Id"]] = region_stacks

    result["AllStacks"] = all_stacks
   
    with open('stacks.json', 'w') as outfile:
        json.dump(result, outfile)
        
    return all_stacks


def process_delete(all_stacks):
    phases = [        
        "-Phase5",
        "Phase4-HostedZonesAssc1",
        "Phase4-RulesAsscociation1",
        "-Phase4",
        "Phase3-CentralVpcResolverEndpoints",
        "-Phase3",
        "Phase2-VpcEndpoints1",
        "-Phase2",
        "-Phase1",
        "-Phase0",
        "-Phase-1",
        "-InitialSetup",
        "{}-CDKToolkit".format(AcceleratorPrefix),
        "{}-PipelineRole".format(AcceleratorPrefix),
    ]

    # Process one phase at a time, but to all accounts through all regions
    # For each Phase
    #  For each Account
    #   For each Region
    #     Look for a stack with name ending in the phase. What status is it in?
    #     Does it contain any S3 buckets? If yes, delete them first
    # Wait until all done
    
    for phase in phases:
        print("\n\nProcessing '{}'".format(phase))
        threads = list()
        try:
            print("Waiting for all Phase stack cleanup threads to finish...")
            for account in all_stacks["Accounts"]:                
                 
                for region in all_stacks["Regions"]:                    

                    for stack in all_stacks["AllStacks"][account["AccountId"]][region]:                        
                        if stack["StackName"].endswith(phase):                            
                            t = threading.Thread(target=thread_cloudformation_delete, args=(phase, region, stack["StackId"], account["AdminRoleArn"], account["AccountId"]))
                            threads.append(t)
                            t.start()
        except:
            print("Error!", sys.exc_info()[0], "occurred.")
        finally:            
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done. All Phase stack cleanup threads finished.")
             
        print("Done processing '{}'".format(phase))



def thread_cloudformation_delete(phase, region, stackid, admin_role, accountId):
    
    print("TID-{} - Processing '{}' in {} {}".format(threading.get_ident(), stackid, accountId, region))
 
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
            if resource["ResourceType"] == "AWS::S3::Bucket" and resource["ResourceStatus"] != "DELETE_COMPLETE":
                #delete all bucket contents first
                print("TID-{} - S3 Bucket Resource '{}'".format(threading.get_ident(), resource["PhysicalResourceId"]))
                delete_s3_bucket(region, credentials["Credentials"], resource["PhysicalResourceId"])
            elif resource["ResourceType"] == "AWS::ElasticLoadBalancingV2::LoadBalancer" and resource["ResourceStatus"] != "DELETE_COMPLETE":
                print("TID-{} - Checking ELB termination protection '{}'".format(threading.get_ident(), resource["PhysicalResourceId"]))
                remove_elb_termination_block(region, credentials["Credentials"], resource["PhysicalResourceId"])
            elif resource["ResourceType"] == "AWS::ECR::Repository" and resource["ResourceStatus"] != "DELETE_COMPLETE":
                print("TID-{} - ECR Resource '{}".format(threading.get_ident(), resource["PhysicalResourceId"]))
                remove_ecr_repository(region, credentials["Credentials"], resource["PhysicalResourceId"])
            elif resource["ResourceType"] == "AWS::IAM::Role" and resource["ResourceStatus"] != "DELETE_COMPLETE":
                print("TID-{} - IAM Role Permission Boundary check '{}'".format(threading.get_ident(), resource["PhysicalResourceId"]))
                remove_permission_boundaries(region, credentials["Credentials"], resource["PhysicalResourceId"])
                remove_permissions_special_case(region, credentials["Credentials"], resource["PhysicalResourceId"])

            


        stack = cloudformation.describe_stacks(
            StackName=stackid
        )

        for index, s in enumerate(stack["Stacks"]):
            stack_name = s["StackId"]
            
            if s["StackStatus"] != "DELETE_COMPLETE":
                print("TID-{} - Deleting Stack Region: {}, StackName: {}, StackStatus: {}".format( threading.get_ident(),region, stack_name, s["StackStatus"]))
           
                cloudformation.update_termination_protection(           
                    EnableTerminationProtection=False,
                    StackName=stack_name
                )

                waiter = cloudformation.get_waiter('stack_delete_complete')

                cloudformation.delete_stack(StackName=stack_name)

                waiter.wait(StackName=stack_name)

                #Did the stack delete fail?
                stack_failed = stack_exists(cloudformation, stack_name, 'DELETE_FAILED')

                print("TID-{} - Done. Deleting Stack Region: {}, StackName: {}, StackStatus: {}".format(threading.get_ident(), region, stack_name, s["StackStatus"]))

               

    except botocore.exceptions.ClientError as err:
        print('TID-{} Error Message: {}'.format(threading.get_ident(), err.response['Error']['Message']))


def stack_exists(client, name, required_status = 'CREATE_COMPLETE'):
    try:
        data = client.describe_stacks(StackName = name)
    except botocore.exceptions.ClientError:
        return False
    return data['Stacks'][0]['StackStatus'] == required_status

def remove_ecr_repository(region, account_credentials, ecr_id):
    ecr =  boto3.client('ecr', 
        region_name=region, 
        aws_access_key_id=account_credentials['AccessKeyId'], 
        aws_secret_access_key=account_credentials['SecretAccessKey'], 
        aws_session_token=account_credentials['SessionToken']
    )

    print("TID-{} - Deleting ECR Repository '{}'".format(threading.get_ident(), ecr_id))
    ecr.delete_repository(repositoryName=ecr_id, force=True)
    print("TID-{} - Deleted ECR Repository '{}'".format(threading.get_ident(), ecr_id))

def remove_permissions_special_case(region, account_credentials, role_id):
    
    if role_id.endswith("-Rsyslog-Role") or role_id.endswith("Firewall-Role"):
        iam =  boto3.client('iam', 
            region_name=region, 
            aws_access_key_id=account_credentials['AccessKeyId'], 
            aws_secret_access_key=account_credentials['SecretAccessKey'], 
            aws_session_token=account_credentials['SessionToken']
        )

        managed_policies = iam.list_attached_role_policies(RoleName=role_id)

        for mpolicy in managed_policies['AttachedPolicies']:
            print("TID-{} - Detaching policy {} from {}".format(threading.get_ident(), mpolicy['PolicyName'], role_id))
            iam.detach_role_policy(RoleName=role_id, PolicyArn=mpolicy['PolicyArn'])
            print("TID-{} - Detached policy {} from {}".format(threading.get_ident(), mpolicy['PolicyName'], role_id))

        inline_policies = iam.list_role_policies(RoleName=role_id)

        for ipolicy in inline_policies['PolicyNames']:
            print("TID-{} - Deleting inline policy {} from {}".format(threading.get_ident(), ipolicy, role_id))
            iam.delete_role_policy(RoleName=role_id, PolicyName=ipolicy)
            print("TID-{} - Deleted inline policy {} from {}".format(threading.get_ident(), ipolicy, role_id))


def remove_permission_boundaries(region, account_credentials, role_id):
    iam =  boto3.client('iam', 
        region_name=region, 
        aws_access_key_id=account_credentials['AccessKeyId'], 
        aws_secret_access_key=account_credentials['SecretAccessKey'], 
        aws_session_token=account_credentials['SessionToken']
    )

    role = iam.get_role(RoleName=role_id)['Role']
        
    # Is there a permission boundary
    if 'PermissionsBoundary' in role:
        print("TID-{} - Removing permission boundary from {}".format(threading.get_ident(), role_id))
        iam.delete_role_permissions_boundary(RoleName=role_id)
        print("TID-{} - Removed permission boundary from {}".format(threading.get_ident(), role_id))
    else:
        print("TID-{} - Role '{}' has no permission boundary".format(threading.get_ident(), role_id))


def remove_elb_termination_block(region, account_credentials, elb_id):
    ec2 =  boto3.client('elbv2', 
        region_name=region, 
        aws_access_key_id=account_credentials['AccessKeyId'], 
        aws_secret_access_key=account_credentials['SecretAccessKey'], 
        aws_session_token=account_credentials['SessionToken']
    )

    elb_attr = ec2.describe_load_balancer_attributes(LoadBalancerArn=elb_id)

    for attr in elb_attr["Attributes"]:        
        if attr["Key"] == "deletion_protection.enabled" and bool(attr["Value"]) == True:
            attr["Value"] = 'false'
            ec2.modify_load_balancer_attributes(
                LoadBalancerArn=elb_id,
                Attributes=[attr]
            )
            print("TID-{} - Removed deletion protection for {}".format(threading.get_ident(), elb_id))



def delete_s3_bucket(region, account_credentials, bucket_name):
    s3 = boto3.resource('s3', 
        region_name=region, 
        aws_access_key_id=account_credentials['AccessKeyId'], 
        aws_secret_access_key=account_credentials['SecretAccessKey'], 
        aws_session_token=account_credentials['SessionToken']
    )
    s3_bucket = s3.Bucket(bucket_name)
    if s3_bucket in s3.buckets.all():
        print("TID-{} - Emptying bucket (this may take a while) {}".format(threading.get_ident(), bucket_name))
        s3_bucket.object_versions.all().delete()
        
        print("TID-{} Done. Emptying bucket (this may take a while) {}".format(threading.get_ident(), bucket_name))
                            
        print('TID-{} Deleting bucket {}'.format(threading.get_ident(), bucket_name))
        try:
            s3_bucket.delete()
            print('TID-{} Done. Deleting bucket {}'.format(threading.get_ident(), bucket_name))
           
        except botocore.exceptions.ClientError as e:
            print("TID-{} Error while trying to delete S3 bucket {}, it should be empty by now so if you see BucketNotEmpty check the bucket in AWS console and delete it manually".format(threading.get_ident(), bucket_name))
            print(e)
             

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
        if scp_name.startswith(AcceleratorPrefix):
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


def root_cleanup(credentials, region):
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
        if name.startswith(AcceleratorPrefix):
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


    cloud_trail_name = AcceleratorPrefix + "-Org-Trail"
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

    cleanup_ecr(credentials, region)

    cleanup_dynamodb(credentials, region)

 

def cleanup():
    print("cleanup")
    supported_regions = []
    admin_role = ""
    root_account_name = ""
    root_region = ""
    security_account_name = ""
    isALZorCT = False
    with open('config.json') as json_file:
        config = json.load(json_file)
        supported_regions = config["global-options"]["supported-regions"]
        admin_role = config["global-options"]["organization-admin-role"]
        config_root_account_name = config["global-options"]["aws-org-management"]["account"]
        root_region = config["global-options"]["aws-org-management"]["region"]
        
        if root_region == "${HOME_REGION}":
            my_session = boto3.session.Session()
            root_region = my_session.region_name
            print("Setting region to '{}'".format(root_region))


        config_security_account_name = config["global-options"]["central-security-services"]["account"]
        
        root_account_name = config["mandatory-account-configs"][config_root_account_name]["account-name"]
        security_account_name = config["mandatory-account-configs"][config_security_account_name]["account-name"]

        isALZ = ("alz-baseline" in config["global-options"] and config["global-options"]["alz-baseline"])


    if isALZ:
        print("This cleanup script is designed to retract all components deployed in the accelerator and is intended for development use. It isn't tested for cleanup with baseline configurations.")
        return

    print("RootAccount: {}", root_account_name)    

    all_stacks = None

    if path.exists("stacks.json"):
        print("Loading stacks.json...")
         
        with open('stacks.json') as stacks_json_file:
            all_stacks = json.load(stacks_json_file)     

        print("Done")       
    else:
        
        aws_accounts = get_accounts()

        all_stacks = build_stack_data(aws_accounts, supported_regions, admin_role, root_account_name)

        print("Review stacks.json")

        print("*** SSO must be cleaned up manually before continuing ***")
        return

   

    root_admin_arn_role = None
    for a in all_stacks["Accounts"]:
        if a["AccountName"] == root_account_name:
            root_admin_arn_role = a["AdminRoleArn"]

    root_credentials = sts.assume_role(
            RoleArn=root_admin_arn_role,
            RoleSessionName="AcceleratorCleanupScript"
    )

    delete_scps(root_credentials, root_region)

    cleanup_route53_resolver_load_config()

    cleanup_directory_sharing_load_config()

    process_delete(all_stacks)
        
    root_cleanup(root_credentials, root_region)
        
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
        cleanup_guardduty(root_credentials, security_credentials, root_region, security_account_name, all_stacks)
        cleanup_macie(root_credentials, security_credentials, root_region, security_account_name, all_stacks)

    cleanup_cwl(all_stacks)

    cleanup_parameter_store(all_stacks)


    
    
def cleanup_macie(root_credentials, security_credentials, root_region, security_account_name, all_stacks):
    print("Cleaning up Macie")
    try:     

        security_account_id = None
        for a in all_stacks["Accounts"]:
            if a["AccountName"] == security_account_name:
                security_account_id = a["AccountId"]

        macie_root = boto3.client("macie2", 
            region_name=root_region,
            aws_access_key_id=root_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=root_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=root_credentials["Credentials"]["SessionToken"]
        )

        macie = boto3.client("macie2", 
            region_name=root_region,
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
                print('Error Message: {} - {}'.format(err.response['Error']['Message'], region))

        threads = list()
        try:
            print("Waiting for all Macie cleanup threads to finish...")
            for account in all_stacks["Accounts"]:                    
                for region in all_stacks["Regions"]:
                   
                    t = threading.Thread(target=thread_macie_delete, args=(region, account["AdminRoleArn"], account["AccountId"]))
                    threads.append(t)
                    t.start()
        finally:                        
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done. All Macie cleanup threads finished.")

        try:
            macie_root.disable_organization_admin_account(
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
              
        try:
            print("Disabling macie in {} for {}".format(region, accountId))
            macie.disable_macie()
        except botocore.exceptions.ClientError as err:
            print('Error Message: {} - {} - {}'.format(err.response['Error']['Message'], accountId, region))
           

    except botocore.exceptions.ClientError as err:
        print('Disabling macie in {} for {}. Error Message: {}'.format(region, accountId, err.response['Error']['Message']))
        


    
def cleanup_guardduty(root_credentials, security_credentials, root_region, security_account_name, all_stacks):
    print("Cleaning up GuardDuty")
    try:     

        security_account_id = None
        for a in all_stacks["Accounts"]:
            if a["AccountName"] == security_account_name:
                security_account_id = a["AccountId"]

        guardduty_root = boto3.client("guardduty", 
            region_name=root_region,
            aws_access_key_id=root_credentials["Credentials"]["AccessKeyId"],
            aws_secret_access_key=root_credentials["Credentials"]["SecretAccessKey"],
            aws_session_token=root_credentials["Credentials"]["SessionToken"]
        )

      

        guardduty = boto3.client("guardduty", 
            region_name=root_region,
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
                    
                    guardduty_root_r = boto3.client("guardduty", 
                        region_name=region,
                        aws_access_key_id=root_credentials["Credentials"]["AccessKeyId"],
                        aws_secret_access_key=root_credentials["Credentials"]["SecretAccessKey"],
                        aws_session_token=root_credentials["Credentials"]["SessionToken"]
                    )

                    try:
                        print("Disabling organization admin account")
                        guardduty_root_r.disable_organization_admin_account(
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
            print("Waiting for all GuardDuty cleanup threads to finish...")            
            for account in all_stacks["Accounts"]:                    
                for region in all_stacks["Regions"]:
                   
                    t = threading.Thread(target=thread_guardduty_delete, args=(region, account["AdminRoleArn"], account["AccountId"]))
                    threads.append(t)
                    t.start()
        finally:                        
            for index, thread in enumerate(threads):            
                thread.join()
            print("Done. All GuardDuty cleanup threads finished.")

        try:
            print("Disabling organization admin account")
            guardduty_root.disable_organization_admin_account(
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
    print("Cleaning up CloudWatch Logs")
    threads = list()
    try:
        print("Waiting for all CloudWatch Logs threads to finish...")
        for account in all_stacks["Accounts"]:
            for region in all_stacks["Regions"]:
                t = threading.Thread(target=thread_cwl_cleanup, args=(region, account["AdminRoleArn"], account["AccountId"]))
                threads.append(t)
                t.start()
    finally:                    
        for index, thread in enumerate(threads):            
            thread.join()
        print("Done. All CloudWatch Logs threads finished.")
            

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
            if AcceleratorPrefix  in log_group["logGroupName"]:
                print("Deleting log group '{}' in {} for {}".format(log_group["logGroupName"], region, accountId))
                cwl.delete_log_group(logGroupName=log_group["logGroupName"])
                print("Deleted log group '{}' in {} for {}".format(log_group["logGroupName"], region, accountId))

        if "nextToken" in log_groups and log_groups["nextToken"] is not None:
            log_groups = cwl.describe_log_groups(nextToken=log_groups["nextToken"])
        else:
            break


def cleanup_parameter_store(all_stacks):
    print("Cleanup SSM Parameters")
    threads = list()
    try:
        print("Waiting for all SSM Parameter cleanup threads to finish...")
        for account in all_stacks["Accounts"]:
            for region in all_stacks["Regions"]:
                t = threading.Thread(target=thread_parameter_store, args=(region, account["AdminRoleArn"], account["AccountId"]))
                threads.append(t)
                t.start()
    finally:                    
        for index, thread in enumerate(threads):            
            thread.join()
        print("Done. All SSM Parameter cleanup threads finished.")

    # todo cleanup the version
            

def thread_parameter_store(region, admin_role_arn, accountId):

    sts = boto3.client("sts")

    credentials = sts.assume_role(
            RoleArn=admin_role_arn,
            RoleSessionName="AcceleratorCleanupScript"
    )

    ssm = boto3.client("ssm", 
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )

    paginator = ssm.get_paginator('get_parameters_by_path')
    page_iterator = paginator.paginate(Path="/{}/".format(AcceleratorPrefix), Recursive=True)
    for ssm_parameters in page_iterator:    
        for ssm_parameter in ssm_parameters["Parameters"]:            
            print("Deleting ssm parameter '{}' in {} for {}".format(ssm_parameter["Name"], region, accountId))
            ssm.delete_parameter(Name=ssm_parameter["Name"])
            print("Deletedlog group '{}' in {} for {}".format(ssm_parameter["Name"], region, accountId))




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
    root_region = ""
    mad_dns_domain = ""

    with open('config.json') as json_file:
        config = json.load(json_file)       

        admin_role = config["global-options"]["organization-admin-role"]        
        root_region = config["global-options"]["aws-org-management"]["region"]

        if root_region == "${HOME_REGION}":
            my_session = boto3.session.Session()
            root_region = my_session.region_name
            print("Setting region to '{}'".format(root_region))


        mad_account_name = config["global-options"]["central-operations-services"]["account"]
        mad_account =  config["mandatory-account-configs"][mad_account_name]["account-name"]
        if "deployments" not in config["mandatory-account-configs"][mad_account_name]:
            return "no deployments section configured"
        if "mad" not in config["mandatory-account-configs"][mad_account_name]["deployments"]:
            return "mad not configured"
        elif config["mandatory-account-configs"][mad_account_name]["deployments"]["mad"] == False:
            return "mad not configured"

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
        cleanup_directory_sharing(mad_account_creds, root_region, mad_dns_domain)


    #Cleanup AD Connector in root account
    cleanup_ad_connectors(root_region, mad_dns_domain)

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
    admin_role = ""
    root_region = ""
    
    with open('config.json') as json_file:
        config = json.load(json_file)
        
        admin_role = config["global-options"]["organization-admin-role"]        
        root_region = config["global-options"]["aws-org-management"]["region"]

        central_account_name = config["global-options"]["central-operations-services"]["account"]
        if "deployments" not in config["mandatory-account-configs"][central_account_name]:
            return "no deployments section configured"
        if "mad" not in config["mandatory-account-configs"][central_account_name]["deployments"]:
            return "mad not configured"
        elif config["mandatory-account-configs"][central_account_name]["deployments"]["mad"] == False:
            return "mad not configured"

        central_resolver_rule_account =  config["mandatory-account-configs"][central_account_name]["deployments"]["mad"]["central-resolver-rule-account"]
                
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
        cleanup_route53_resolver(central_resolver_rule_account_creds, root_region)



def cleanup_ecr(credentials, region):
    print("Cleaning up ECR")

    client = boto3.client("ecr",
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )

def cleanup_dynamodb(credentials, region):
    print("Cleaning up DynamoDB")

    client = boto3.client("dynamodb",
        region_name=region,
        aws_access_key_id=credentials["Credentials"]["AccessKeyId"],
        aws_secret_access_key=credentials["Credentials"]["SecretAccessKey"],
        aws_session_token=credentials["Credentials"]["SessionToken"]
    )

    tables = client.list_tables()

    for tableName in tables["TableNames"]:
        if tableName.startswith(AcceleratorPrefix):
            print("Deleting DynamoDB Table '{}'".format(tableName))
            client.delete_table(TableName=tableName)
            print("Deleted DynamoDB Table '{}'".format(tableName))

def cleanup_secrets(credentials, region):
    print("Cleaning up")


def cleanup_config_aggregators(credentials, region):
    print("Cleaning up config aggregators")


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
                if AcceleratorPrefix != 'ASEA':
                    CodeCommitPrefix = AcceleratorPrefix
                else:
                    CodeCommitPrefix = 'ASEA'
                if repo["repositoryName"].startswith(CodeCommitPrefix):
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
    args = parser.parse_args()
    AcceleratorPrefix = re.sub('-$', '', args.AcceleratorPrefix)
    params = {}
    params['AcceleratorPrefix'] = AcceleratorPrefix
    if args.GblRegion:
        params['GblRegion'] = args.GblRegion
    if args.HomeRegion:
        params['HomeRegion'] = args.HomeRegion
    return params

if __name__ == "__main__":
    params = configure_args()
    AcceleratorPrefix = params['AcceleratorPrefix']
    backup_config()
    replacements(params)
    cleanup()

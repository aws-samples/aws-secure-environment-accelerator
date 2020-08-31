#!/usr/bin/env bash

# Domain name to search for resolver rule
Domain="dept.cloud-nuage.gc.ca"
region="ca-central-1"

# Finds the resolver rule Id for the given domain name
function get_resolver_id() {
    resolver_id=$(aws route53resolver list-resolver-rules --region $region --filters Name=DomainName,Values=$Domain --query ResolverRules[].Id --output text)
}

# Finds VPCs associated to the resolver rule Id
function get_vpc_ids() {
    vpc_ids=$(aws route53resolver list-resolver-rule-associations --region $region --filters Name=ResolverRuleId,Values=$1 --query ResolverRuleAssociations[].VPCId --output json | awk '{print $1}' | tr -d '[]",')
}

# Checks association of VPCs from the resolver rule
function _checkStatus() {
    while [ -n "$vpc_ids" ]
        do
        echo "waiting to disassociate VPCs from resolver rule $resolver_id"
        sleep 5
        get_vpc_ids $resolver_id
    done
    echo "completed disassociating VPCs from resolver rule $resolver_id"
}

# Verify and disassicate VPCs from resolver rule
function disassociate_vpc_ids() {
    get_resolver_id
    if [ -z "$resolver_id" ]
        then
        echo "Resolver rule not found with domain $Domain"
    else
        echo "Found resolver rule with domain $Domain... $resolver_id"
        get_vpc_ids $resolver_id
        if [ -z "$vpc_ids" ] 
            then
            echo "VPCs are not associated to resolver rule $resolver_id"
        else
            echo "started disassociating VPCs from resolver rule $resolver_id"
            for vpc_id in $vpc_ids; do
                result=$(aws route53resolver disassociate-resolver-rule  --region $region --resolver-rule-id ${resolver_id} --vpc-id $vpc_id)
            done
            _checkStatus
        fi
    fi
}

disassociate_vpc_ids

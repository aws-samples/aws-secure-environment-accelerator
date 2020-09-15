import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff, delay } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  bucketName?: string;
  rulesDomainNames?: string[];
  phzDomainNames?: string[];
}

const s3 = new AWS.S3();
const route53 = new AWS.Route53();
const route53Resolver = new AWS.Route53Resolver();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Deletes resources based on input properties...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return;
  }
}

async function onCreateOrUpdate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, rulesDomainNames, phzDomainNames } = properties;

  // If bucket name exists, deleting the attached bucket policy
  if (bucketName) {
    await throttlingBackOff(() =>
      s3
        .deleteBucketPolicy({
          Bucket: bucketName,
        })
        .promise(),
    );
  }

  // If resolver rules domain names exists, delete resolver rules
  // w.r.t to the domain names
  for (const domain of rulesDomainNames || []) {
    const resolverRuleIds = await getResolverRuleIds(domain);
    for (const ruleId of resolverRuleIds || []) {
      let vpcIds = await getVpcIds(ruleId!);
      for (const vpcId of vpcIds || []) {
        try {
          await throttlingBackOff(() =>
            route53Resolver
              .disassociateResolverRule({
                ResolverRuleId: ruleId!,
                VPCId: vpcId!,
              })
              .promise(),
          );
        } catch (error) {
          console.warn(error);
        }
      }

      do {
        vpcIds = await getVpcIds(ruleId!);
        // Waiting to disassociate VPC Ids from the resolver rule
        await delay(5000);
      } while ((vpcIds || []).length > 0);

      // Deleting resolver rule after disassociation of VPC Ids
      try {
        await throttlingBackOff(() =>
          route53Resolver
            .deleteResolverRule({
              ResolverRuleId: ruleId!,
            })
            .promise(),
        );
      } catch (error) {
        console.warn(error);
      }
    }
  }

  // If private hosted zones domain names exists, delete private hosted zones
  // w.r.t to the domain names
  for (const domain of phzDomainNames || []) {
    const privateHostedZone = await throttlingBackOff(() =>
      route53
        .listHostedZonesByName({
          DNSName: domain,
        })
        .promise(),
    );
    const hostedZoneIds = privateHostedZone.HostedZones.filter(p => p.Name === domain);

    for (const zoneId of hostedZoneIds) {
      try {
        await throttlingBackOff(() =>
          route53
            .deleteHostedZone({
              Id: zoneId.Id,
            })
            .promise(),
        );
      } catch (error) {
        console.warn(error);
      }
    }
  }
}

async function getVpcIds(resolverRuleId: string) {
  // Get the vpc associations for the resolver
  try {
    const associations = await throttlingBackOff(() =>
      route53Resolver
        .listResolverRuleAssociations({
          Filters: [
            {
              Name: 'ResolverRuleId',
              Values: [resolverRuleId],
            },
          ],
        })
        .promise(),
    );

    const vpcIds = associations.ResolverRuleAssociations?.map(a => a.VPCId);
    return vpcIds;
  } catch (error) {
    console.warn(error);
  }
}

async function getResolverRuleIds(domain: string) {
  // Get the resolver rule details for the domain
  try {
    const resolverRule = await throttlingBackOff(() =>
      route53Resolver
        .listResolverRules({
          Filters: [
            {
              Name: 'DomainName',
              Values: [domain],
            },
          ],
        })
        .promise(),
    );
    return resolverRule.ResolverRules?.map(r => r.Id);
  } catch (error) {
    console.warn(error);
  }
}

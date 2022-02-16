/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

const AWS = require('aws-sdk');
const fs = require('fs');

AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from 'siem-common';
import { throttlingBackOff } from 'siem-common';

const s3 = new AWS.S3();

export interface HandlerProperties {
  openSearchDomain: string;
  adminRoleMappingArn: string;
  openSearchConfigurationS3Bucket: string;
  openSearchConfigurationS3Key: string;
  osProcesserRoleArn: string;
}

export const handler = errorHandler(onEvent);

const region = process.env.AWS_REGION || ''; // 'ca-central-1'; // Dev
let openSearchAdminCredentials: any;

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`OpenSearch Siem Configuration...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  return `OpenSearchSiemConfiguration`;
}

async function getS3Body(bucketName: string, bucketPath: string) {
  try {
    const object: any = await throttlingBackOff(() =>
      s3
        .getObject({
          Bucket: bucketName,
          Key: bucketPath,
        })
        .promise(),
    );
    return object.Body!;
  } catch (e) {
    throw new Error(`Unable to load S3 file s3://${bucketName}/${bucketPath}: ${e}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  const {
    openSearchDomain,
    adminRoleMappingArn,
    osProcesserRoleArn,
    openSearchConfigurationS3Bucket,
    openSearchConfigurationS3Key,
  } = properties;

  console.log('Opensearch Siem Events Processor');

  console.log('Download configuration file');

  const fileBody = await getS3Body(openSearchConfigurationS3Bucket, openSearchConfigurationS3Key);
  console.log('Downloaded file');
  const siemOpenSearchConfig = JSON.parse(fileBody.toString());
  // For Development
  // const rawdata = fs.readFileSync('../../../../../reference-artifacts/siem/opensearch-config.json');
  // siemOpenSearchConfig = JSON.parse(rawdata.toString());

  openSearchAdminCredentials = new AWS.EnvironmentCredentials('AWS');

  await configureOpenSearch(openSearchDomain, siemOpenSearchConfig, osProcesserRoleArn, adminRoleMappingArn);

  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }

  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

const osAuth = async (domain: string, region: string, method: string, path: string, body: any) => {
  const endpoint = new AWS.Endpoint(domain);
  const request = new AWS.HttpRequest(endpoint, region);

  request.method = method;
  request.path += path;
  if (body) {
    request.body = JSON.stringify(body);
    request.headers['Content-Length'] = Buffer.byteLength(request.body).toString();
  }

  request.headers.host = domain;
  request.headers['Content-Type'] = 'application/json';

  const signer = new AWS.Signers.V4(request, 'es');

  signer.addAuthorization(openSearchAdminCredentials, new Date());

  return request;
};

const osSendRequest = async (request: any) => {
  const client = new AWS.HttpClient();
  return new Promise((resolve, reject) => {
    client.handleRequest(
      request,
      null,
      function (response: any) {
        let responseBody = '';
        response.on('data', function (chunk: any) {
          responseBody += chunk;
        });
        response.on('end', function (chunk: any) {
          resolve(responseBody);
        });
      },
      function (error: any) {
        console.log('Error: ' + error);
        reject(error);
      },
    );
  });
};

const query = async (openSearchDomain: string, method: string, path: string, document: any) => {
  const request = await osAuth(openSearchDomain, region, method, path, document);
  const response: any = await osSendRequest(request);

  return response.length > 0 ? JSON.parse(response) : null;
};

const upsertObj = async (openSearchDomain: string, obj: any, method: string, path: string) => {
  for (const itemKey of Object.keys(obj)) {
    const payload = obj[itemKey];
    const objPath = `${path}/${itemKey}`;
    console.log(objPath);
    const resp = await query(openSearchDomain, method, objPath, payload);
    console.log(JSON.stringify(resp));
  }
};

const deleteObj = async (openSearchDomain: string, obj: any, path: string) => {
  for (const itemKey of Object.keys(obj)) {
    const objPath = `${path}/${itemKey}`;
    console.log(`Does ${objPath} exist?`);
    const respHead = await query(openSearchDomain, 'HEAD', objPath, null);
    if (respHead) {
      // Exists
      console.log('Exists');
      const respDelete = query(openSearchDomain, 'DELETE', objPath, null);
      console.log(respDelete);
    } else {
      continue;
    }
  }
};

const upsertPolicy = async (openSearchDomain: string, obj: any) => {
  for (const itemKey of Object.keys(obj)) {
    let objPath = `_plugins/_ism/policies/${itemKey}`;
    const resp = await query(openSearchDomain, 'GET', objPath, null);

    console.log(resp);

    if ('_id' in resp) {
      const seqNo = resp._seq_no;
      const primaryTerm = resp._primary_term;
      objPath = `${objPath}?if_seq_no=${seqNo}&if_primary_term=${primaryTerm}`;
    }

    const payload = obj[itemKey];
    const respPut = await query(openSearchDomain, 'PUT', objPath, payload);
    console.log(respPut);
  }
};

const configureIndexRollover = async (openSearchDomain: string, indexPatterns: any) => {
  console.log();
  console.log(`Create initial index 000001 for rollover`);
  //  console.log(indexPatterns);
  let idx = null;
  let payload = {};
  for (const objKey of Object.keys(indexPatterns)) {
    console.log(`objKey: ${objKey}`);
    const alias = objKey.replace('_rollover', '');
    const resAlias = await query(openSearchDomain, 'GET', alias, null);
    let isRefresh = false;
    console.log(resAlias);
    if (!('status' in resAlias)) {
      console.log(`Already exists ${alias} key ${objKey}`);
      idx = Object.keys(resAlias)[0];

      const resCount = await query(openSearchDomain, 'GET', `${idx}/_count`, null);

      if ('count' in resCount) {
        const docCount = resCount.count;
        if (docCount === 0) {
          await query(openSearchDomain, 'DELETE', idx, null);
          console.log(`${idx} is deleted and refrehsed`);
          isRefresh = true;
        }
      }
    } else {
      isRefresh = true;
      idx = objKey.replace('_rollover', '-000001');
    }

    if (isRefresh && idx) {
      console.log('Putting alias update');
      payload = { aliases: { [alias]: { is_write_index: true } } };
      const res = await query(openSearchDomain, 'PUT', idx, payload);
      console.log(res);
    }
  }
};

const configureOpenSearch = async (
  openSearchDomain: string,
  siemOpenSearchConfig: any,
  osProcesserRoleArn: string,
  adminRoleMappingArn: string,
) => {
  console.log(`Create or update role/mapping`);

  console.log(`Applying cluster settings`);
  const clusterSettings = siemOpenSearchConfig['cluster-settings'];
  for (const key of Object.keys(clusterSettings)) {
    console.log(`system setting: ${key}`);
    const payload = clusterSettings[key];
    console.log(payload);
    const res = await query(openSearchDomain, 'PUT', '_cluster/settings', payload);
    console.log(JSON.stringify(res));
  }

  console.log('Applying component templates');
  const componentTemplates = siemOpenSearchConfig['component-templates'];
  await upsertObj(openSearchDomain, componentTemplates, 'PUT', '_component_template');

  console.log('Applying index templates');
  const indexTemplates = siemOpenSearchConfig['index-templates'];
  await upsertObj(openSearchDomain, indexTemplates, 'PUT', '_index_template');

  // create index_state_management_policies such as rollover policy
  console.log('Applying index policies');
  const policies = siemOpenSearchConfig.index_state_management_policies;
  await upsertPolicy(openSearchDomain, policies);

  // index template for rollover
  const indexRollover = siemOpenSearchConfig['index-rollover'];
  await upsertObj(openSearchDomain, indexRollover, 'PUT', '_index_template');

  // index rollvover
  await configureIndexRollover(openSearchDomain, indexRollover);

  // apply role mapping
  await upsertRoleMapping(openSearchDomain, 'all_access', null, null, adminRoleMappingArn, null);
  await upsertRoleMapping(openSearchDomain, 'security_manager', null, null, adminRoleMappingArn, null);
  await upsertRoleMapping(openSearchDomain, 'event_processor', null, null, osProcesserRoleArn, null);

  // // delete legacy index templates
  const oldLegacyTemplates = siemOpenSearchConfig['deleted-old-index-template'];
  await deleteObj(openSearchDomain, oldLegacyTemplates, '_template');

  console.log('Create/Update legacy index templates');
  const legacyTemplates = siemOpenSearchConfig['legacy-index-template'];
  await upsertObj(openSearchDomain, legacyTemplates, 'PUT', '_template');
};

const upsertRoleMapping = async (
  openSearchDomain: string,
  roleName: string,
  osAppData?: any,
  userToAdd?: any,
  roleToAdd?: any,
  hostToAdd?: any,
) => {
  console.log(`roleName: ${roleName}`);

  const roleRes: any = await query(openSearchDomain, 'GET', `_plugins/_security/api/roles/${roleName}`, null);
  console.log(JSON.stringify(roleRes));

  const res: any = await query(openSearchDomain, 'GET', `_plugins/_security/api/rolesmapping/${roleName}`, null);
  console.log(res);

  if (res.status === 'NOT_FOUND') {
    console.log('Create new role/mapping');
    const pathRoles = `_plugins/_security/api/roles/${roleName}`;
    const newRolepayload = {
      description: 'Provide the minimum permissions for aws es_loader',
      cluster_permissions: [
        'cluster_monitor',
        'cluster_composite_ops',
        'indices:admin/template/get',
        'indices:admin/template/put',
        'cluster:admin/ingest/pipeline/put',
        'cluster:admin/ingest/pipeline/get',
        'cluster:admin/cold/indices/search',
      ],
      index_permissions: [
        {
          index_patterns: ['log-*'],
          fls: [],
          masked_fields: [],
          allowed_actions: ['crud', 'create_index'],
        },
      ],
      tenant_permissions: [],
    };
    console.log(`Body: ${JSON.stringify(newRolepayload)}`);
    const responseNewRole = await query(openSearchDomain, 'PUT', pathRoles, newRolepayload);
    console.log(responseNewRole);
    await sleep(3);

    const pathRoleMappings = `_plugins/_security/api/rolesmapping/${roleName}`;
    const newBackendRolePayload = {
      backend_roles: [roleToAdd],
    };
    console.log(JSON.stringify(newBackendRolePayload));
    const responseNewBackendRole = await query(openSearchDomain, 'PUT', pathRoleMappings, newBackendRolePayload);
    console.log(responseNewBackendRole);
    return true;
  } else if (roleName in res) {
    console.log(`Role '${roleName}' already exists`);
    console.log(res[roleName].backend_roles);

    if (res[roleName].backend_roles.indexOf(roleToAdd) === -1) {
      const backendRoles = [...res[roleName].backend_roles, roleToAdd];
      const pathRoleMappings = `_plugins/_security/api/rolesmapping/${roleName}`;
      const newBackendRolePayload = [
        {
          op: 'replace',
          path: '/backend_roles',
          value: backendRoles,
        },
      ];
      console.log(JSON.stringify(newBackendRolePayload));

      const responseNewBackendRole = await query(openSearchDomain, 'PATCH', pathRoleMappings, newBackendRolePayload);
      console.log(responseNewBackendRole);
    }
  }
};

const sleep = async (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

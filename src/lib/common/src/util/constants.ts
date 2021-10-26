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

export const DNS_LOGGING_LOG_GROUP_REGION = 'us-east-1';
export const CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX = 'CloudWatchLogs/';
export const JSON_FORMAT = 'json';
export const YAML_FORMAT = 'yaml';
export const RAW_CONFIG_FILE = 'raw/config.json';
// These SNS Topics are created regions in central log services account
export const SNS_NOTIFICATION_TYPES = ['High', 'Medium', 'Low', 'Ignore'];

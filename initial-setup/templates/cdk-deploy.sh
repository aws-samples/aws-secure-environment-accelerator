#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="PBMMAccel-PipelineRole"

export ACCELERATOR_PHASE=$1
export ACCELERATOR_ACCOUNT_KEY=$2
export ACCELERATOR_REGION=$3

pnpx cdk deploy \
  --require-approval never \
  --version-reporting false \
  --path-metadata false \
  --asset-metadata false \
  --force \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/app.ts"

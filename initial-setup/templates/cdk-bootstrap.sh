#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="PBMMAccel-PipelineRole"

export ACCELERATOR_PHASE=$1
export ACCELERATOR_ACCOUNT_KEY=$2
export ACCELERATOR_REGION=$3

pnpx cdk bootstrap \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/app.ts"

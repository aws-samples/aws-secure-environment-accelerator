#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="AcceleratorPipelineRole"

APP_PATH=$1

pnpx cdk deploy \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/$APP_PATH" "*"

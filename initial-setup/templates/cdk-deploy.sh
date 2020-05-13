#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="PBMMAccel-PipelineRole"

APP_PATH=$1
shift

ARGS=$@
if [ -z "$ARGS" ]
then
  ARGS="'*'"
fi

pnpx cdk deploy \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/$APP_PATH" $ARGS

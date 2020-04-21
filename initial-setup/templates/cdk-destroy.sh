#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="AcceleratorPipelineRole"

APP_PATH=$1
shift

ARGS=$@
if [ -z "$ARGS" ]
then
  ARGS="*"
fi

pnpx cdk destroy \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/$APP_PATH" $ARGS

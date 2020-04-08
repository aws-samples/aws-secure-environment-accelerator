#!/bin/sh

export CDK_PLUGIN_ASSUME_ROLE_NAME="AcceleratorPipelineRole"

pnpx cdk bootstrap \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/index.dev.ts"

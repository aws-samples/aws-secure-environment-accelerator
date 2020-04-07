#!/bin/sh

export AWS_PROFILE="$1"
export AWS_REGION="ca-central-1"
export CDK_PLUGIN_ASSUME_ROLE_NAME="AcceleratorPipelineRole"

pnpx cdk synth \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/index.dev.ts"

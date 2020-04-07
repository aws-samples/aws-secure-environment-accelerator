#!/bin/sh

export AWS_PROFILE="$1"
export AWS_REGION="ca-central-1"
export CDK_PLUGIN_ASSUME_ROLE_NAME="AcceleratorPipelineRole"

# Remove the first command-line argument so we can use the rest of the arguments with $@
shift

pnpx cdk deploy \
  --require-approval never \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/index.dev.ts" "$@"

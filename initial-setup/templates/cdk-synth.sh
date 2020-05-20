#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="PBMMAccel-PipelineRole"

APP_PATH=$1

pnpx cdk synth \
  --version-reporting false \
  --path-metadata false \
  --asset-metadata false \
  --force \
  --plugin "$(pwd)/../../plugins/assume-role" \
  --app "pnpx ts-node src/$APP_PATH"

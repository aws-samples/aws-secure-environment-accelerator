#!/bin/bash

if [[ -z "${ACCELERATOR_PHASE}" ]]; then
  echo "The environment variable ACCELERATOR_PHASE has to be set to the path of the app you want to deploy."
  exit 1
fi
if [[ -z "${ACCELERATOR_ACCOUNT_KEY}" ]]; then
  echo "The environment variable ACCELERATOR_ACCOUNT_KEY has to be set to the path of the app you want to deploy."
  exit 1
fi
if [[ -z "${ACCELERATOR_REGION}" ]]; then
  echo "The environment variable ACCELERATOR_REGION has to be set to the path of the app you want to deploy."
  exit 1
fi

echo "Deploying phase $ACCELERATOR_PHASE..."

ASSUME_ROLE_PLUGIN_PATH="$(pwd)/../../plugins/assume-role"

pnpx cdk bootstrap \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node src/app.ts"

pnpx cdk deploy "*" \
  --require-approval never \
  --version-reporting false \
  --path-metadata false \
  --asset-metadata false \
  --force \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node src/app.ts"

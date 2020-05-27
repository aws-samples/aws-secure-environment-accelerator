#!/bin/bash

ASSUME_ROLE_PLUGIN_PATH="$(pwd)/../../plugins/assume-role"

if [[ -z "${ACCELERATOR_PHASE}" ]]; then
  echo "The environment variable ACCELERATOR_PHASE has to be set to the path of the app you want to deploy."
  exit 1
fi

echo "Bootstrapping..."

pnpx cdk bootstrap \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node --transpile-only src/app.ts"

echo "Deploying phase $ACCELERATOR_PHASE..."

pnpx cdk deploy "*" \
  --require-approval never \
  --version-reporting false \
  --path-metadata false \
  --asset-metadata false \
  --force \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node --transpile-only src/app.ts"

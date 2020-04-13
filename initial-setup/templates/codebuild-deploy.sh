#!/bin/bash

if [[ -z "${APP_PATH}" ]]; then
  echo "The environment variable APP_PATH has to be set to the path of the app you want to deploy."
  exit 1
fi

echo "Deploying app $APP_PATH..."

ASSUME_ROLE_PLUGIN_PATH="$(pwd)/../../plugins/assume-role"

pnpx cdk bootstrap \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node src/$APP_PATH"

# Deploy all stacks for the given app
pnpx cdk deploy "*" \
  --require-approval never \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node src/$APP_PATH"

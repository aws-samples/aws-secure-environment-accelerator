#!/bin/bash

ASSUME_ROLE_PLUGIN_PATH="$(pwd)/../../plugins/assume-role"

pnpx cdk bootstrap \
  --plugin "$ASSUME_ROLE_PLUGIN_PATH" \
  --app "pnpx ts-node src/app.ts"

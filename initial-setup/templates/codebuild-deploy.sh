#!/bin/sh

if [ -z "${ACCELERATOR_PHASE}" ]; then
  echo "The environment variable ACCELERATOR_PHASE has to be set to the path of the app you want to deploy."
  exit 1
else
  phase_arg="--phase=${ACCELERATOR_PHASE}"
fi

if [ -n "${ACCELERATOR_REGION}" ]; then
  region_arg="--region ${ACCELERATOR_REGION}"
fi
if [ -n "${ACCELERATOR_ACCOUNT_KEY}" ]; then
  account_arg="--account-key=${ACCELERATOR_ACCOUNT_KEY}"
fi

echo "Deploying phase $ACCELERATOR_PHASE..."

pnpx ts-node --transpile-only cdk.ts bootstrap deploy --parallel ${phase_arg} ${region_arg} ${account_arg}

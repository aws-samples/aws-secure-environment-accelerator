#!/bin/sh

if [ "${COMPUTE_TYPE}" = "BUILD_GENERAL1_MEDIUM" ]; then
  echo "Increasing the max_old_space_size to 2048"
  export NODE_OPTIONS=--max_old_space_size=2048
elif [ "${COMPUTE_TYPE}" = "BUILD_GENERAL1_LARGE" ]; then
  echo "The codebuild build type has changed from default to ${COMPUTE_TYPE}, increasing the max_old_space_size to 8192"
  export NODE_OPTIONS=--max_old_space_size=8192
elif [ "${COMPUTE_TYPE}" = "BUILD_GENERAL1_2XLARGE" ]; then
  echo "The codebuild build type has changed from default to ${COMPUTE_TYPE}, increasing the max_old_space_size to 16384"
  export NODE_OPTIONS=--max_old_space_size=16384
else
  echo "The codebuild build type is ${COMPUTE_TYPE}"
fi

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

pnpx ts-node --transpile-only cdk.ts deploy --parallel ${phase_arg} ${region_arg} ${account_arg}

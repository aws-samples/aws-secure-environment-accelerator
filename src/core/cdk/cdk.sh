#!/bin/sh

export ACCELERATOR_NAME="ASEA"
export ACCELERATOR_PREFIX="ASEA-"
export ACCELERATOR_STATE_MACHINE_NAME=${ACCELERATOR_PREFIX}MainStateMachine_sm

export CDK_NEW_BOOTSTRAP=1
export BOOTSTRAP_STACK_NAME=${ACCELERATOR_PREFIX}CDKToolkit
# Make sure initial-setup-lambdas and all custom resources are built
pnpm install --frozen-lockfile

pnpx cdk --require-approval never $@

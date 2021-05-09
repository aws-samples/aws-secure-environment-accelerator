#!/bin/sh

export ACCELERATOR_NAME="PBMM"
export ACCELERATOR_PREFIX="PBMMAccel-"
export ACCELERATOR_STATE_MACHINE_NAME="PBMMAccel-MainStateMachine_sm"

export CDK_NEW_BOOTSTRAP=1
export BOOTSTRAP_STACK_NAME=PBMMAccel-CDKToolkit
# Make sure initial-setup-lambdas and all custom resources are built
pnpm install --frozen-lockfile

pnpx cdk --require-approval never $@

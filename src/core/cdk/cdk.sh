#!/bin/sh

export ACCELERATOR_NAME="PBMM"
export ACCELERATOR_PREFIX="PBMMAccel-"
export ACCELERATOR_STATE_MACHINE_NAME="PBMMAccel-MainStateMachine_sm"

# Make sure initial-setup-lambdas and all custom resources are built
pnpm install

pnpx cdk --require-approval never $@

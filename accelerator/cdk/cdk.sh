#!/bin/sh

export ACCELERATOR_NAME="PBMM"
export ACCELERATOR_PREFIX="PBMMAccel-"
export ACCELERATOR_STATE_MACHINE_NAME="PBMMAccel-MainStateMachine_sm"

pnpx cdk --require-approval never $@

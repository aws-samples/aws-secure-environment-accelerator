#!/bin/sh

export ACCELERATOR_NAME="PBMM"
export ACCELERATOR_PREFIX="PBMMAccel-"
export ACCELERATOR_CONFIG_SECRET_ID="accelerator/config"
export ACCELERATOR_STATE_MACHINE_NAME="MainStateMachine"

pnpx cdk --require-approval never $@

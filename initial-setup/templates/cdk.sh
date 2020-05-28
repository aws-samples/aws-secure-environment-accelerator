#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="PBMMAccel-PipelineRole"

pnpx ts-node cdk.ts $@

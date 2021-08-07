#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="pbmm-PipelineRole"

pnpx ts-node --transpile-only cdk.ts $@
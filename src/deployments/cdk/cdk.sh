#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="ASEA-PipelineRole"
export AWS_REGION="eu-west-2"

pnpx ts-node --transpile-only cdk.ts $@
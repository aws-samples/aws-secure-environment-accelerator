#!/bin/sh

export CONFIG_MODE="development"
export CDK_PLUGIN_ASSUME_ROLE_NAME="ASEA-PipelineRole"
export AWS_REGION="us-east-1"

pnpx ts-node --transpile-only cdk.ts $@
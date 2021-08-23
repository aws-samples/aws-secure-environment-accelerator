/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { Box, Checkbox, CheckboxProps, Container, FormField, Header, SpaceBetween } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { Indent } from '@/components/indent';
import { TypeTreeNode } from '@/types';
import { useEnableNode } from '../util';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField, WizardInlineBooleanField } from '../components/fields';
import { getVpcNodes } from '../components/vpc-table';

export interface SelectSecurityServicesStepProps {
  configuration: any;
}

const globalOptionsNode = AcceleratorConfigurationNode.nested('global-options');
const securityServicesNode = globalOptionsNode.nested('central-security-services');
const securityHubNode = securityServicesNode.nested<t.BooleanType>('security-hub');
const logServicesNode = globalOptionsNode.nested('central-log-services');
const operationsServicesNode = globalOptionsNode.nested('central-operations-services');
const awsConfigNode = globalOptionsNode.nested('aws-config');
const standardsNode = globalOptionsNode.nested('security-hub-frameworks').nested('standards');

export const SelectSecurityServicesStep = observer(function SelectSecurityServicesStep({
  configuration,
}: SelectSecurityServicesStepProps) {
  const { tr } = useI18n();

  return (
    <SpaceBetween size="xxl" direction="vertical">
      <Container
        header={
          <Header variant="h2" description={tr('wizard.headers.security_services_desc')}>
            {tr('wizard.headers.security_services')}
          </Header>
        }
      >
        <SpaceBetween size="xs" direction="vertical">
          <Box>{tr('wizard.labels.security_services_text')}</Box>
          <SpaceBetween size="xxs">
            <WizardInlineBooleanField state={configuration} node={securityHubNode} />
            <Indent>
              <SpaceBetween size="xxs">
                <SecurityHubFrameworkStandard
                  standardsNode={standardsNode}
                  state={configuration}
                  name="AWS Foundational Security Best Practices v1.0.0"
                  initialControlsToDisable={['IAM.1']}
                />
                <SecurityHubFrameworkStandard
                  standardsNode={standardsNode}
                  state={configuration}
                  name="PCI DSS v3.2.1"
                  initialControlsToDisable={['PCI.IAM.3', 'PCI.KMS.1', 'PCI.S3.3', 'PCI.EC2.3', 'PCI.Lambda.2']}
                />
                <SecurityHubFrameworkStandard
                  standardsNode={standardsNode}
                  state={configuration}
                  name="CIS AWS Foundations Benchmark v1.2.0"
                  initialControlsToDisable={['CIS.1.20', 'CIS.1.22', 'CIS.2.8']}
                />
              </SpaceBetween>
            </Indent>
            <WizardInlineBooleanField state={configuration} node={securityServicesNode.nested('guardduty')} />
            <WizardInlineBooleanField state={configuration} node={securityServicesNode.nested('guardduty-s3')} />
            <WizardInlineBooleanField state={configuration} node={securityServicesNode.nested('access-analyzer')} />
            <WizardInlineBooleanField state={configuration} node={securityServicesNode.nested('macie')} />
            <FormField
              label={tr('wizard.fields.aws_config')}
              description={tr('wizard.fields.aws_config_desc')}
              stretch={true}
            >
              <Indent>
                <SpaceBetween size="xxs">
                  <FrameworkProvidedRules state={configuration} />
                  <FrameworkProvidedRemediations state={configuration} />
                </SpaceBetween>
              </Indent>
            </FormField>
            <FormField
              controlId={securityServicesNode.path.join('.')}
              label={tr('wizard.fields.cwl_centralized_access')}
              description={tr('wizard.fields.cwl_centralized_access_desc')}
              stretch={true}
            >
              <Indent>
                <SpaceBetween size="xxs">
                  <WizardInlineBooleanField
                    state={configuration}
                    node={securityServicesNode.nested('cwl')}
                    context={{
                      label: tr('wizard.fields.cwl_central_security_services_account'),
                      description: tr('wizard.fields.cwl_central_security_services_account_desc'),
                    }}
                  />
                  <WizardInlineBooleanField
                    state={configuration}
                    node={operationsServicesNode.nested('cwl')}
                    context={{
                      label: tr('wizard.fields.cwl_central_operations_account'),
                      description: tr('wizard.fields.cwl_central_operations_account_desc'),
                    }}
                  />
                </SpaceBetween>
              </Indent>
            </FormField>
          </SpaceBetween>
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header variant="h2" description={tr('wizard.headers.security_services_logging_desc')}>
            {tr('wizard.headers.security_services_logging')}
          </Header>
        }
      >
        <SpaceBetween size="xs" direction="vertical">
          <Box>{tr('wizard.labels.security_services_logging_text')}</Box>
          <SpaceBetween size="xxs">
            <FormField
              controlId={securityServicesNode.path.join('.')}
              label={tr('wizard.fields.retention_periods_for')}
              description={tr('wizard.fields.retention_periods_for_desc')}
              stretch={true}
            >
              <Indent>
                <SpaceBetween size="xxs">
                  <WizardField state={configuration} node={logServicesNode.nested('s3-retention')} />
                  <WizardField state={configuration} node={globalOptionsNode.nested('default-cwl-retention')} />
                  <WizardField state={configuration} node={globalOptionsNode.nested('default-s3-retention')} />
                </SpaceBetween>
              </Indent>
            </FormField>
            <FormField
              label={tr('wizard.fields.vpc_flow_logs_all_vcps')}
              description={tr('wizard.fields.vpc_flow_logs_all_vcps_desc')}
              stretch={true}
            >
              <Indent>
                <SpaceBetween size="xxs">
                  <FlowLogsComponent state={configuration} />
                </SpaceBetween>
              </Indent>
            </FormField>
            <DnsResolverLoggingComponent state={configuration} />
            <FormField
              controlId={securityServicesNode.path.join('.')}
              label={tr('wizard.fields.ssm_logs_to')}
              description={tr('wizard.fields.ssm_logs_to_desc')}
              stretch={true}
            >
              <Indent>
                <SpaceBetween size="xxs">
                  <WizardInlineBooleanField state={configuration} node={logServicesNode.nested('ssm-to-cwl')} />
                  <WizardInlineBooleanField state={configuration} node={logServicesNode.nested('ssm-to-s3')} />
                </SpaceBetween>
              </Indent>
            </FormField>
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
});

export interface SecurityHubFrameworkStandardProps {
  state: any;
  standardsNode: TypeTreeNode;
  name: string;
  initialControlsToDisable: string[];
  label?: string;
}

/**
 * Component that renders a single security hub framework standard checkbox.
 */
export const SecurityHubFrameworkStandard = observer((props: SecurityHubFrameworkStandardProps) => {
  const { initialControlsToDisable, name, label = name, state, standardsNode } = props;
  const securityHubEnabled = securityHubNode.get(state);

  // Find the standard index by its name
  const standards: any[] = standardsNode.get(state) ?? [];
  let standardIndex = standards.findIndex((standard: any) => standard.name === name);
  if (standardIndex < 0) {
    standardIndex = standards.length;
  }

  // Track enabled changes
  const standardNode = standardsNode.nested(standardIndex);
  const [enabled, handleEnableChange] = useEnableNode(standardNode, state, () => ({
    name,
    'controls-to-disable': initialControlsToDisable,
  }));

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox
        checked={enabled}
        disabled={securityHubEnabled !== true}
        onChange={event => handleEnableChange(event.detail.checked)}
      />
      <label>{label}</label>
    </SpaceBetween>
  );
});

interface FlowLogsComponentProps {
  state: any;
}

const hasS3FlowLogsEnabled = (value: string) => value === 'S3' || value === 'BOTH';
const hasCloudWatchFlowLogsEnabled = (value: string) => value === 'CWL' || value === 'BOTH';

/**
 * Component that renders checkboxes to manage VPC flow logs for all VPCs.
 */
const FlowLogsComponent = observer((props: FlowLogsComponentProps) => {
  const { state } = props;
  const { tr } = useI18n();

  const vpcNodes = getVpcNodes(state);
  const flowFlogNodes = vpcNodes.map(vpcNode => vpcNode.nested('flow-logs'));
  const flowFlogValues = flowFlogNodes.map(flowLogNode => flowLogNode.get(state));

  const s3Enabled = flowFlogValues.some(hasS3FlowLogsEnabled);
  const s3Indeterminate = flowFlogValues.some(v => hasS3FlowLogsEnabled(v) !== s3Enabled);
  const cwlEnabled = flowFlogValues.some(hasCloudWatchFlowLogsEnabled);
  const cwlIndeterminate = flowFlogValues.some(v => hasCloudWatchFlowLogsEnabled(v) !== cwlEnabled);

  // Transition from BOTH to CWL or from S3 to NONE
  const handleS3Change: CheckboxProps['onChange'] = action(event => {
    for (const flowFlogNode of flowFlogNodes) {
      const flowLogValue = flowFlogNode.get(state);
      if (event.detail.checked) {
        if (flowLogValue === 'CWL') {
          flowFlogNode.set(state, 'BOTH');
        } else if (flowLogValue === 'NONE') {
          flowFlogNode.set(state, 'S3');
        }
      } else {
        if (flowLogValue === 'S3') {
          flowFlogNode.set(state, 'NONE');
        } else if (flowLogValue === 'BOTH') {
          flowFlogNode.set(state, 'CWL');
        }
      }
    }
  });

  // Transition from BOTH to S3 or from CWL to NONE
  const handleCwlChange: CheckboxProps['onChange'] = action(event => {
    for (const flowFlogNode of flowFlogNodes) {
      const flowLogValue = flowFlogNode.get(state);
      if (event.detail.checked) {
        if (flowLogValue === 'S3') {
          flowFlogNode.set(state, 'BOTH');
        } else if (flowLogValue === 'NONE') {
          flowFlogNode.set(state, 'CWL');
        }
      } else {
        if (flowLogValue === 'CWL') {
          flowFlogNode.set(state, 'NONE');
        } else if (flowLogValue === 'BOTH') {
          flowFlogNode.set(state, 'S3');
        }
      }
    }
  });

  return (
    <>
      <SpaceBetween size="s" direction="horizontal">
        <Checkbox checked={s3Enabled} indeterminate={s3Indeterminate} onChange={handleS3Change} />
        <label>{tr('wizard.fields.vpc_flow_logs_s3')}</label>
      </SpaceBetween>
      <SpaceBetween size="s" direction="horizontal">
        <Checkbox checked={cwlEnabled} indeterminate={cwlIndeterminate} onChange={handleCwlChange} />
        <label>{tr('wizard.fields.vpc_flow_logs_cwl')}</label>
      </SpaceBetween>
    </>
  );
});

interface DnsResolverLoggingComponentProps {
  state: any;
}

/**
 * Component that renders a checkbox to manage DNS resolver logging for all VPCs.
 */
const DnsResolverLoggingComponent = observer((props: DnsResolverLoggingComponentProps) => {
  const { state } = props;
  const { tr } = useI18n();

  // Find all VPC nodes in the state
  const vpcNodes = getVpcNodes(state);

  // Load all logging nodes in all VPCs
  const loggingNodes = vpcNodes.map(vpcNode => vpcNode.nested('dns-resolver-logging'));
  const loggingValues = loggingNodes.map(flowLogNode => flowLogNode.get(state));

  const enabled = loggingValues.some(v => v === true);
  const indeterminate = loggingValues.some(v => v !== enabled);

  const handleChange: CheckboxProps['onChange'] = action(event => {
    for (const loggingNode of loggingNodes) {
      loggingNode.set(state, event.detail.checked);
    }
  });

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={enabled} indeterminate={indeterminate} onChange={handleChange} />
      <label>{tr('wizard.fields.dns_resolver_logging_all_vpcs')}</label>
    </SpaceBetween>
  );
});

const frameworkProvidedRulesNode = awsConfigNode.nested('rules');

interface FrameworkProvidedRulesProps {
  state: any;
}

const FrameworkProvidedRules = observer((props: FrameworkProvidedRulesProps) => {
  const { state } = props;
  const { tr } = useI18n();
  const [enabled, setEnabled] = useEnableNode(frameworkProvidedRulesNode, state, () => []);
  const rules = frameworkProvidedRulesNode.get(state) ?? [];

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={enabled} disabled={rules.length === 0} onChange={e => setEnabled(e.detail.checked)} />
      <label>{tr('wizard.fields.aws_config_rules', { count: rules.length })}</label>
    </SpaceBetween>
  );
});

interface FrameworkProvidedRemediationsProps {
  state: any;
}

const ssmAutomationNode = globalOptionsNode.nested('ssm-automation');

const FrameworkProvidedRemediations = observer((props: FrameworkProvidedRemediationsProps) => {
  const { state } = props;
  const { tr } = useI18n();
  const [enabled, setEnabled] = useEnableNode(ssmAutomationNode, state, () => []);
  const ssmAutomation = (ssmAutomationNode.get(state) as c.SsmShareAutomation[]) ?? [];
  const ssmAutomationDocumentCount = ssmAutomation.reduce<number>((c, a) => c + (a?.documents.length ?? 0), 0);

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox
        checked={enabled}
        disabled={ssmAutomationDocumentCount === 0}
        onChange={e => setEnabled(e.detail.checked)}
      />
      <label>{tr('wizard.fields.aws_config_remediations', { count: ssmAutomationDocumentCount })}</label>
    </SpaceBetween>
  );
});

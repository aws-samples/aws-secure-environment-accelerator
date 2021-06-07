/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { Box, Checkbox, Container, FormField, Header, SpaceBetween } from '@awsui/components-react';
import { Indent } from '@/components/indent';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField, WizardInlineBooleanField } from '../fields';
import { useEnableNode } from '../util';

export interface SelectSecurityServicesStepProps {
  configuration: any;
}

const globalOptionsNode = AcceleratorConfigurationNode.nested('global-options');
const servicesNode = globalOptionsNode.nested('central-security-services');
const operationsNode = globalOptionsNode.nested('central-operations-services');
const awsConfigNode = globalOptionsNode.nested('aws-config');
const standardsNode = globalOptionsNode.nested('security-hub-frameworks').nested('standards');

export const SelectSecurityServicesStep = observer(function SelectSecurityServicesStep({
  configuration,
}: SelectSecurityServicesStepProps) {
  return (
    <Container header={<Header variant="h2">Select security services</Header>}>
      <SpaceBetween size="xs" direction="vertical">
        <Box variant="small">The proposed framework recommends enabling the following security services.</Box>
        <SpaceBetween size="xxs">
          <WizardInlineBooleanField state={configuration} node={servicesNode.nested('security-hub')} />
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
          <WizardInlineBooleanField state={configuration} node={servicesNode.nested('guardduty')} />
          <WizardInlineBooleanField state={configuration} node={servicesNode.nested('guardduty-s3')} />
          <WizardInlineBooleanField state={configuration} node={servicesNode.nested('access-analyzer')} />
          <AwsConfig state={configuration} awsConfigNode={awsConfigNode} />
          {/* TODO */}
          {/* <Indent>
          <WizardInterfaceField state={configuration} node={awsConfigRules} spaceBetween="xxs" />
        </Indent> */}
          <WizardInlineBooleanField state={configuration} node={servicesNode.nested('macie')} />
          <FormField
            controlId={servicesNode.path.join('.')}
            label={'Systems Manager Session Manager logs to:'}
            stretch={true}
          >
            <Indent>
              <SpaceBetween size="xxs">
                <WizardInlineBooleanField
                  state={configuration}
                  node={servicesNode.nested('cwl')}
                  context={{ label: 'Central security services account' }}
                />
                <WizardInlineBooleanField
                  state={configuration}
                  node={operationsNode.nested('cwl')}
                  context={{ label: 'Central operations account' }}
                />
              </SpaceBetween>
            </Indent>
          </FormField>
          <FormField
            controlId={servicesNode.path.join('.')}
            label={'Systems Manager Session Manager logs to:'}
            stretch={true}
          >
            <Indent>
              <SpaceBetween size="xxs">
                <WizardInlineBooleanField state={configuration} node={servicesNode.nested('ssm-to-cwl')} />
                <WizardInlineBooleanField state={configuration} node={servicesNode.nested('ssm-to-s3')} />
              </SpaceBetween>
            </Indent>
          </FormField>
          <FormField controlId={servicesNode.path.join('.')} label={'Retention periods for:'} stretch={true}>
            <Indent>
              <SpaceBetween size="xs">
                <WizardField state={configuration} node={globalOptionsNode.nested('default-s3-retention')} />
                <WizardField state={configuration} node={globalOptionsNode.nested('default-cwl-retention')} />
              </SpaceBetween>
            </Indent>
          </FormField>
          {/* TODO */}
          {/* <SimpleFormFieldWrapper state={configuration} node={vpcFlowLogs} validation={false}>
          <Indent>
            <WizardInterfaceField state={configuration} node={vpcFlowLogs} spaceBetween="xxs" />
          </Indent>
        </SimpleFormFieldWrapper> */}
          {/* <WizardInlineBooleanField state={configuration} node={node.nested('dnsResolverLogging')} /> */}
        </SpaceBetween>
      </SpaceBetween>
    </Container>
  );
});

export const AwsConfig = observer((props: { state: any; awsConfigNode: TypeTreeNode }) => {
  const { awsConfigNode, state } = props;
  const [enabled, handleEnableChange] = useEnableNode(awsConfigNode, state, createInitialAwsConfig);

  return (
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={enabled} onChange={event => handleEnableChange(event.detail.checked)} />
      <label>AWS Config</label>
    </SpaceBetween>
  );
});

export const SecurityHubFrameworkStandard = observer(
  (props: {
    state: any;
    standardsNode: TypeTreeNode;
    name: string;
    initialControlsToDisable: string[];
    label?: string;
  }) => {
    const { initialControlsToDisable, name, label = name, state, standardsNode } = props;

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
        <Checkbox checked={enabled} onChange={event => handleEnableChange(event.detail.checked)} />
        <label>{label}</label>
      </SpaceBetween>
    );
  },
);

function createInitialAwsConfig() {
  // TODO
  return {};
}

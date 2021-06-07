/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import * as c from '@aws-accelerator/config';
import { Checkbox, Container, FormField, Header, Input, SpaceBetween } from '@awsui/components-react';
import { FieldProps } from '@/components/fields/field';
import { Indent } from '@/components/indent';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from '../fields';
import { useEnableNode } from '../util';

export interface ConfigureNetworkStepProps {
  configuration: any;
}

const cidrPoolsNode = AcceleratorConfigurationNode.nested('global-options').nested('cidr-pools');
const ouConfigNode = AcceleratorConfigurationNode.nested('organizational-units');
const mandatoryAccountConfigNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigNode = AcceleratorConfigurationNode.nested('workload-account-configs');

export const ConfigureNetworkStep = observer(function ConfigureNetworkStep({
  configuration,
}: ConfigureNetworkStepProps) {
  const vpcNodes = [
    ...getVpcNodes(ouConfigNode, configuration),
    ...getVpcNodes(mandatoryAccountConfigNode, configuration),
    ...getVpcNodes(workloadAccountConfigNode, configuration),
  ];

  return (
    <SpaceBetween size="xxl">
      <Container header={<Header variant="h2">CIDR pool configuration</Header>}>
        <WizardField state={configuration} node={cidrPoolsNode} />
      </Container>
      <Container header={<Header variant="h2">VPC configuration</Header>}>
        <SpaceBetween size="l">
          {vpcNodes.map(vpcNode => (
            <VpcConfigurationComponent state={configuration} node={vpcNode} disabled={true} />
          ))}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
});

/**
 * Custom renderer for VPC configuration that hides certain fields.
 */
const VpcConfigurationComponent = observer((props: FieldProps<typeof c.VpcConfigType>) => {
  const { node, state } = props;
  const { path } = node;

  const cidrNode = node.nested('cidr').nested(0);
  const tgwAttachNode = node.nested('tgw-attach');
  const [twgAttachEnabled, handleTgwEnableChange] = useEnableNode(tgwAttachNode, state, createInitialTgwAttach);

  const vpc = node.get(state);
  const vpcDefinedIn = path?.[0] === 'organizational-units' ? 'Organizational Unit' : 'Account';
  const subnetsShared = vpc?.subnets?.find(s => s['share-to-ou-accounts'] || s['share-to-specific-accounts']) != null;

  return (
    <>
      {path.join('/')}
      <Indent>
        <SpaceBetween size="m">
          <WizardField state={state} node={node.nested('name')} disabled={true} />
          <FormField label="Defined in" stretch>
            <Input value={vpcDefinedIn} disabled />
          </FormField>
          {/* TODO Pick from 'local' or account */}
          <WizardField state={state} node={node.nested('deploy')} />
          <WizardField state={state} node={node.nested('region')} />
          <WizardField state={state} node={cidrNode.nested('pool')} />
          <WizardField state={state} node={cidrNode.nested('size')} />
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox checked={subnetsShared} disabled />
            <span>Subnet shared</span>
          </SpaceBetween>
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox checked={twgAttachEnabled} onChange={event => handleTgwEnableChange(event.detail.checked)} />
            <span>Transit gateway attached</span>
          </SpaceBetween>
        </SpaceBetween>
      </Indent>
    </>
  );
});

function getVpcNodes(node: TypeTreeNode, state: any): TypeTreeNode<typeof c.VpcConfigType>[] {
  return Object.keys(node.get(state) ?? {}).flatMap(accountKey => {
    // prettier-ignore
    const vpcArrayNode = node
        .nested(accountKey)
        .nested<typeof c.VpcConfigType>('vpc');
    const vpcArray = vpcArrayNode.get(state) ?? [];
    return Object.keys(vpcArray).map(key => vpcArrayNode.nested(key));
  });
}

function createInitialTgwAttach(): c.TransitGatewayAttachConfig {
  // TODO Which values to use here?
  return {
    'associate-to-tgw': 'Main',
    account: 'shared-network',
    'associate-type': 'VPN',
    'tgw-rt-associate': ['core'],
    'tgw-rt-propagate': ['core', 'segregated', 'shared', 'standalone'],
    'blackhole-route': false,
    'attach-subnets': [],
    options: ['DNS-support'],
  };
}

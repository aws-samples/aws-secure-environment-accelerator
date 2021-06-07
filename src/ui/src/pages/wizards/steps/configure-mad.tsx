/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import * as c from '@aws-accelerator/config';
import { Checkbox, Container, Header, SpaceBetween } from '@awsui/components-react';
import { FieldProps } from '@/components/fields/field';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from '../fields';
import { Indent } from '@/components/indent';
import { useEnableNode } from '../util';

export interface ConfigureMadStepProps {
  configuration: any;
}

const mandatoryAccountConfigNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigNode = AcceleratorConfigurationNode.nested('workload-account-configs');

export const ConfigureMadStep = observer(function ConfigureMadStep({ configuration }: ConfigureMadStepProps) {
  const madNodes = [
    ...Object.keys(mandatoryAccountConfigNode.get(configuration) ?? {}).map(accountKey => ({
      accountKey,
      // prettier-ignore
      madNode: mandatoryAccountConfigNode
        .nested(accountKey)
        .nested('deployments')
        .nested<typeof c.MadConfigType>('mad'),
    })),
    ...Object.keys(workloadAccountConfigNode.get(configuration) ?? {}).map(accountKey => ({
      accountKey,
      // prettier-ignore
      madNode: workloadAccountConfigNode
        .nested(accountKey)
        .nested('deployments')
        .nested<typeof c.MadConfigType>('mad'),
    })),
  ];

  return (
    <SpaceBetween size="xxl">
      <Container header={<Header variant="h2">Managed active directory</Header>}>
        <SpaceBetween size="m">
          {madNodes.map(({ accountKey, madNode }) => (
            <SpaceBetween size="s" key={accountKey}>
              <span>{accountKey}</span>
              <Indent>
                <MadConfigurationComponent state={configuration} node={madNode} />
              </Indent>
            </SpaceBetween>
          ))}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
});

/**
 * Custom renderer for MadConfiguration that hides certain fields.
 */
const MadConfigurationComponent = observer((props: FieldProps<typeof c.MadConfigType>) => {
  const { node, state } = props;
  const [enabled, handleEnableChange] = useEnableNode(node, state, createInitialMadConfiguration);

  return (
    <>
      <Checkbox checked={enabled} onChange={event => handleEnableChange(event.detail.checked)} />
      {enabled && (
        <>
          <WizardField state={state} node={node.nested('dir-id')} />
          <WizardField state={state} node={node.nested('dns-domain')} />
          <WizardField state={state} node={node.nested('netbios-domain')} />
          <WizardField state={state} node={node.nested('ad-users')} />
        </>
      )}
    </>
  );
});

function createInitialMadConfiguration(): c.MadDeploymentConfig {
  // TODO Initial MAD configuration value
  return {
    'dir-id': 1001,
    deploy: true,
    'vpc-name': 'Central',
    region: '${HOME_REGION}',
    subnet: 'GCWide',
    size: 'Enterprise',
    'image-path': '/aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base',
    'dns-domain': 'example.local',
    'netbios-domain': 'example',
    'central-resolver-rule-account': 'shared-network',
    'central-resolver-rule-vpc': 'Endpoint',
    'log-group-name': '/${ACCELERATOR_PREFIX_ND}/MAD/example.local',
    // TODO Add replacements to configuration definition
    // @ts-ignore
    restrict_srcips: '${RANGE-RESTRICT}',
    'num-rdgw-hosts': 1,
    'min-rdgw-hosts': 1,
    'max-rdgw-hosts': 2,
    'rdgw-max-instance-age': 30,
    'rdgw-instance-type': 't2.large',
    'rdgw-instance-role': '${ACCELERATOR_PREFIX_ND}-RDGW-Role',
    'password-policies': {
      history: 24,
      'max-age': 90,
      'min-age': 1,
      'min-len': 14,
      complexity: true,
      reversible: false,
      'failed-attempts': 6,
      'lockout-duration': 30,
      'lockout-attempts-reset': 30,
    },
    'ad-groups': ['aws-Provisioning', 'aws-Billing'],
    'ad-per-account-groups': ['*-Admin', '*-PowerUser', '*-View'],
    'adc-group': 'ADConnector-grp',
    'ad-users': [
      {
        user: 'adconnector-usr',
        email: 'myemail+aseaT-adc-usr@example.com',
        groups: ['ADConnector-grp'],
      },
      {
        user: 'User1',
        email: 'myemail+aseaT-User1@example.com',
        groups: ['aws-Provisioning', '*-View', '*-Admin', '*-PowerUser', 'AWS Delegated Administrators'],
      },
      {
        user: 'User2',
        email: 'myemail+aseaT-User2@example.com',
        groups: ['*-View'],
      },
    ],
    'security-groups': [
      {
        name: 'RemoteDesktopGatewaySG',
        'inbound-rules': [
          {
            description: 'Allow RDP Traffic Inbound',
            type: ['RDP'],
            // TODO Add replacements to configuration definition
            // @ts-ignore
            source: '${RANGE-RESTRICT}',
          },
        ],
        'outbound-rules': [
          {
            description: 'All Outbound',
            type: ['ALL'],
            source: ['0.0.0.0/0'],
            port: undefined,
            fromPort: undefined,
            toPort: undefined,
            'tcp-ports': undefined,
            'udp-ports': undefined,
          },
        ],
      },
    ],
  };
}

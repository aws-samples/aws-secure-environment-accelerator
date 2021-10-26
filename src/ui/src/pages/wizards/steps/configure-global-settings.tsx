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
import { STS } from '@aws-sdk/client-sts';
import { ServiceCatalog } from '@aws-sdk/client-service-catalog';
import { action, runInAction, set } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormField,
  Header,
  Select,
  SelectProps,
  SpaceBetween,
  StatusIndicator,
} from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { AwsConfiguration, useAwsConfiguration } from '@/components/aws-credentials-context';
import { EnumField } from '@/components/fields/enum';
import { useEffectAsync } from '@/utils/hooks';
import { ImportModal, ImportModalProps } from '@/components/import-modal';
import { useStateInput } from '@/components/fields/input';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode, ConfigurationNode } from '../configuration';
import { WizardField } from '../components/fields';

export interface ConfigureGlobalSettingsStepProps {
  state: any;
  configuration: any;
}

const globalOptionsNode = AcceleratorConfigurationNode.nested('global-options');
const controlTowerNode = globalOptionsNode.nested('ct-baseline');
const centralBucketNode = globalOptionsNode.nested('central-bucket');
// prettier-ignore
const securityEmailsNode = globalOptionsNode
  .nested('central-log-services')
  .nested('sns-subscription-emails');

  /* TODO: Debug backend common.ts code vpcReplacements line 267 */
 const vpcReplacements = (props: string) => {
    const rawConfigStr  = props;
    /* eslint-disable no-template-curly-in-string */
    const ouOrAccountReplacementRegex = '\\${CONFIG::OU_NAME}';
    const vpcConfigSections = ['workload-account-configs', 'mandatory-account-configs', 'organizational-units'];
    const rawConfig = JSON.parse(rawConfigStr);
    for (const vpcConfigSection of vpcConfigSections) {
      Object.entries(rawConfig[vpcConfigSection]).map(([key, _]) => {
        const replacements = {
          '\\${CONFIG::VPC_NAME}': key,
          '\\${CONFIG::VPC_NAME_L}': key.toLowerCase(),
          '\\${CONFIG::OU_NAME}': key,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const [index, vpcConfig] of Object.entries(rawConfig[vpcConfigSection][key].vpc || []) as [string, any]) {
          vpcConfig.name = vpcConfig.name.replace(new RegExp(ouOrAccountReplacementRegex, 'g'), key);
          let vpcConfigStr = JSON.stringify(vpcConfig);
          for (const [key, value] of Object.entries(replacements)) {
            vpcConfigStr = vpcConfigStr.replace(new RegExp(key, 'g'), value);
          }
          rawConfig[vpcConfigSection][key].vpc[index] = JSON.parse(vpcConfigStr);
        }
      });
    }
    /* eslint-enable */
    return rawConfig;
  }

export const ConfigureGlobalSettingsStep = observer(function ConfigureGlobalSettingsStep({
  state,
  configuration,
}: ConfigureGlobalSettingsStepProps) {
  const { tr } = useI18n();
  const { configuration: awsConfiguration, setModalVisible: setAwsConfigurationModalVisible } = useAwsConfiguration();
  const [importVisible, setImportDialogVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [filename, setFileName] = useState("")
  const controlTowerEnabled = controlTowerNode.get(configuration);

  const handleAwsConfiguration = useCallback(() => {
    setAwsConfigurationModalVisible(true);
  }, []);

  const handleSelectConfiguration = () => {
    setImportDialogVisible(true);
  };

  const handleImportSubmit: ImportModalProps['onSubmit'] = action(value => {
    const value2 = vpcReplacements(JSON.stringify(value));
    set(configuration, value2); // Set configuration to the imported value
    set(state, {}); // Reset wizard state
    setImportDialogVisible(false);
    setFileName(value['global-options']['workloadaccounts-param-filename'])
    setAlertVisible(true);
    
  });

  const handleImportDismiss: ImportModalProps['onDismiss'] = () => {
    setImportDialogVisible(false);
  };

  // Detect control tower
  useEffectAsync(
    action(async () => {
      state.region = state.region ?? (awsConfiguration.region as t.Region);

      const credentialsSet = hasCredentials(awsConfiguration);
      if (state.authenticated === undefined) {
        if (credentialsSet) {
          try {
            const sts = new STS(awsConfiguration);
            await sts.getCallerIdentity({});
            runInAction(() => {
              state.authenticated = true;
            });
          } catch (e) {
            runInAction(() => {
              state.authenticated = false;
            });
          }
        }
      } else if (!credentialsSet) {
        runInAction(() => {
          state.authenticated = undefined;
        });
      }

      if (state.controlTowerDetected === undefined) {
        try {
          const catalog = new ServiceCatalog(awsConfiguration);
          await catalog.describeProduct({
            Name: 'AWS Control Tower Account Factory',
          });
          runInAction(() => {
            state.controlTowerDetected = true;
            state.installationType = 'CONTROL_TOWER';
          });
        } catch (e) {
          runInAction(() => {
            state.controlTowerDetected = false;
            state.installationType = 'STANDALONE';
          });
        }
      }
    }),
    [awsConfiguration],
  );

  return (
    <>
      <SpaceBetween size="xxl">
        <Container
          header={
            <Header variant="h2" description={tr('wizard.headers.aws_configuration_desc')}>
              {tr('wizard.headers.aws_configuration')}
            </Header>
          }
        >
          <SpaceBetween size="xl" direction="vertical">
            <FormField
              label={tr('wizard.fields.aws_credentials')}
              description={tr('wizard.fields.aws_credentials_desc')}
              stretch
            >
              <SpaceBetween size="s">
                <Button onClick={handleAwsConfiguration}>{tr('wizard.buttons.configure_aws_credentials')}</Button>
                {state.authenticated == null ? (
                  <StatusIndicator type="warning">{tr('wizard.labels.credentials_not_set')}</StatusIndicator>
                ) : state.authenticated ? (
                  <StatusIndicator type="success">{tr('wizard.labels.credentials_valid')}</StatusIndicator>
                ) : (
                  <StatusIndicator type="error">{tr('wizard.labels.credentials_not_valid')}</StatusIndicator>
                )}
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </Container>
        <Container
          header={
            <Header variant="h2" description={tr('wizard.headers.framework_desc')}>
              {tr('wizard.headers.framework')}
            </Header>
          }
        >
          <SpaceBetween size="xl" direction="vertical">
            <FormField
              label={tr('wizard.fields.architecture_template')}
              description={tr('wizard.fields.architecture_template_desc')}
              stretch
            >
               <SpaceBetween size="xl" direction="vertical">
              <Button onClick={handleSelectConfiguration}>{tr('wizard.buttons.select_configuration_file')}</Button>
              <Alert 
                onDismiss={() => setAlertVisible(false)} 
                visible={alertVisible} 
                dismissAriaLabel="Close alert" 
                dismissible type="success"> Successfully uploaded configuration file: {filename} </Alert>
                </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </Container>
        <Container
          header={
            <Header variant="h2" description={tr('wizard.headers.basic_settings_desc')}>
              {tr('wizard.headers.basic_settings')}
            </Header>
          }
        >
          <SpaceBetween size="xl" direction="vertical">
            <FormField
              label={tr('wizard.fields.installation_region')}
              description={tr('wizard.fields.installation_region_desc')}
              stretch
            >
              <EnumField state={state} node={ConfigurationNode.nested('region') as TypeTreeNode<t.EnumType<any>>} />
            </FormField>
            <FormField
              label={tr('wizard.fields.installation_type')}
              description={tr('wizard.fields.installation_type_desc')}
              stretch
            >
              <SpaceBetween size="xs">
                <InstallationTypeComponent state={configuration} node={controlTowerNode} />
                {state.authenticated == null ? (
                  controlTowerEnabled ? (
                    <StatusIndicator type="warning" className="break-word">
                      {tr('wizard.labels.ct_enabled_not_authenticated')}
                    </StatusIndicator>
                  ) : (
                    <StatusIndicator type="warning" className="break-word">
                      {tr('wizard.labels.ct_disabled_not_authenticated')}
                    </StatusIndicator>
                  )
                ) : state.controlTowerDetected ? (
                  controlTowerEnabled ? (
                    <StatusIndicator type="success" className="break-word">
                      {tr('wizard.labels.ct_detected_and_enabled')}
                    </StatusIndicator>
                  ) : (
                    <StatusIndicator type="warning" className="break-word">
                      {tr('wizard.labels.ct_detected_and_disabled')}
                    </StatusIndicator>
                  )
                ) : controlTowerEnabled ? (
                  <StatusIndicator type="warning" className="break-word">
                    {tr('wizard.labels.ct_not_detected_and_enabled')}
                  </StatusIndicator>
                ) : (
                  <StatusIndicator type="success" className="break-word">
                    {tr('wizard.labels.ct_not_detected_and_disabled')}
                  </StatusIndicator>
                )}
              </SpaceBetween>
            </FormField>
            <WizardField state={configuration} node={centralBucketNode} context={{ replacement: false }} />
          </SpaceBetween>
        </Container>
        <Container
          header={
            <Header variant="h2" description={tr('wizard.headers.security_notifications_desc')}>
              {tr('wizard.headers.security_notifications')}
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box>{tr('wizard.labels.security_notifications_text')}</Box>
            <StatusIndicator type="info">{tr('wizard.labels.security_notifications_email_not_unique')}</StatusIndicator>
            <SpaceBetween size="xs">
              <WizardField
                node={securityEmailsNode.nested('High').nested(0)}
                state={configuration}
                context={{
                  label: tr('wizard.fields.high_priority_email'),
                  description: tr('wizard.fields.high_priority_email_desc'),
                }}
              />
              <WizardField
                node={securityEmailsNode.nested('Medium').nested(0)}
                state={configuration}
                context={{
                  label: tr('wizard.fields.medium_priority_email'),
                  description: tr('wizard.fields.medium_priority_email_desc'),
                }}
              />
              <WizardField
                node={securityEmailsNode.nested('Low').nested(0)}
                state={configuration}
                context={{
                  label: tr('wizard.fields.low_priority_email'),
                  description: tr('wizard.fields.low_priority_email_desc'),
                }}
              />
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
      <ImportModal visible={importVisible} onSubmit={handleImportSubmit} onDismiss={handleImportDismiss} />
    </>
  );
});

interface InstallationTypeComponentProps {
  state: any;
  node: TypeTreeNode;
}

const installationTypeOptions: SelectProps['options'] = [
  {
    label: 'Standalone',
    value: '0',
  },
  {
    label: 'Control Tower',
    value: '1',
  },
];

const InstallationTypeComponent = observer((props: InstallationTypeComponentProps) => {
  const { value: selectedOption, onChange } = useStateInput<SelectProps.ChangeDetail, boolean, SelectProps.Option>({
    node: props.node,
    state: props.state,
    mapStateToValue: (stateValue: boolean) => (stateValue ? installationTypeOptions[1] : installationTypeOptions[0]),
    mapDetailToValue: detail => detail.selectedOption.value === '1',
  });
  return <Select selectedOption={selectedOption} options={installationTypeOptions} onChange={onChange} />;
});

function hasCredentials(awsConfiguration: AwsConfiguration | undefined) {
  const credentials = awsConfiguration?.credentials;
  if (!credentials) {
    return false;
  }
  return (
    !credentials.accessKeyId ||
    !credentials.secretAccessKey ||
    credentials.accessKeyId === '' ||
    credentials.secretAccessKey === ''
  );
}
function getStringFromObject(rawConfig: any, JSON_FORMAT: any): string | PromiseLike<string> {
  throw new Error('Function not implemented.');
}

function JSON_FORMAT(rawConfig: any, JSON_FORMAT: any): string | PromiseLike<string> {
  throw new Error('Function not implemented.');
}


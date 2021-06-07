/* eslint-disable @typescript-eslint/no-explicit-any */
import { S3 } from '@aws-sdk/client-s3';
import { STS } from '@aws-sdk/client-sts';
import { ServiceCatalog } from '@aws-sdk/client-service-catalog';
import { action, set } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import { Button, Container, FormField, Header, SpaceBetween, StatusIndicator } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { useAwsConfiguration } from '@/components/aws-credentials-context';
import { Indent } from '@/components/indent';
import { SimpleFormFieldWrapper } from '@/components/node-field';
import { EnumField } from '@/components/fields/enum';
import { StringField } from '@/components/fields/string';
import { useEffectAsync } from '@/utils/hooks';
import { ImportModal, ImportModalProps } from '@/components/import-modal';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode, acceleratorToWizardConfiguration, ConfigurationNode } from '../configuration';
import { WizardField, WizardInterfaceField } from '../fields';

export interface ConfigureGlobalSettingsStepProps {
  state: any;
  configuration: any;
}

const globalOptionsNode = AcceleratorConfigurationNode.nested('global-options');
// prettier-ignore
const securityEmailsNode = globalOptionsNode
  .nested('central-log-services')
  .nested('sns-subscription-emails');

export const ConfigureGlobalSettingsStep = observer(function ConfigureGlobalSettingsStep({
  state,
  configuration,
}: ConfigureGlobalSettingsStepProps) {
  const { configuration: awsConfiguration, setModalVisible: setAwsConfigurationModalVisible } = useAwsConfiguration();
  const [importVisible, setImportDialogVisible] = useState(false);

  const handleAwsConfiguration = useCallback(() => {
    setAwsConfigurationModalVisible(true);
  }, []);

  const handleSelectConfiguration = () => {
    setImportDialogVisible(true);
  };

  const handleImportSubmit: ImportModalProps['onSubmit'] = action(value => {
    set(configuration, value);
    set(state, acceleratorToWizardConfiguration(value));
    setImportDialogVisible(false);
  });

  const handleImportDismiss: ImportModalProps['onDismiss'] = () => {
    setImportDialogVisible(false);
  };

  useEffectAsync(
    action(async () => {
      state.region = state.region ?? (awsConfiguration.region as t.Region);

      try {
        const sts = new STS(awsConfiguration);
        await sts.getCallerIdentity({});
        state.authenticated = true;
      } catch (e) {
        state.authenticated = false;
      }

      try {
        const catalog = new ServiceCatalog(awsConfiguration);
        await catalog.describeProduct({
          Name: 'AWS Control Tower Account Factory',
        });
        state.controlTowerDetected = true;
        state.installationType = 'CONTROL_TOWER';
      } catch (e) {
        state.controlTowerDetected = false;
        state.installationType = 'STANDALONE';
      }
    }),
    [awsConfiguration],
  );

  useEffectAsync(
    action(async () => {
      if (state.authenticated) {
        try {
          const s3 = new S3(awsConfiguration);
          await s3.headBucket({
            Bucket: state.bucketName,
          });
          state.bucketExists = true;
        } catch (e) {
          state.bucketExists = false;
        }
      }
    }),
    [state.authenticated, state.bucketName],
  );

  const notificationsNode = ConfigurationNode.nested('notifications');

  return (
    <>
      <SpaceBetween size="xxl">
        <Container header={<Header variant="h2">AWS configuration</Header>}>
          <SpaceBetween size="xl" direction="vertical">
            <FormField label={'AWS credentials'} stretch>
              <SpaceBetween size="s">
                <Button onClick={handleAwsConfiguration}>Configure credentials</Button>
                {state.authenticated ? (
                  <StatusIndicator type="success">The given credentials are valid.</StatusIndicator>
                ) : (
                  <StatusIndicator type="error">The given credentials are not valid.</StatusIndicator>
                )}
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Framework</Header>}>
          <SpaceBetween size="xl" direction="vertical">
            <FormField
              label={'Architecture template'}
              description="Select a prescriptive architecture template to use as a starting point."
              stretch
            >
              <Button onClick={handleSelectConfiguration}>Select configuration file</Button>
            </FormField>
            <FormField label={'Installation region'} stretch>
              <EnumField state={state} node={ConfigurationNode.nested('region') as TypeTreeNode<t.EnumType<any>>} />
            </FormField>
            <FormField label={'Installation type'} stretch>
              <SpaceBetween size="xs">
                {/* TODO */}
                {/**
                 * In stated situation also display the following message:
                 *   1) Detected – if region mismatch: “The Control Tower home region is different than Accelerator home region,
                 * this is not supported. Please change the Accelerator home region to {CT-home-region}” ([“Next”] grayed)
                 *   2) Detected – Region match: “Installing using Control Tower as a baseline.” ([“Next”] button enabled)
                 *   3) Not Detected, home region not supported – “Installing standalone Accelerator as Control Tower is not
                 * available in this region.” ([“Next”] button enabled)
                 *   4) Not Detected, home region supports CT, framework has ct:false – “Proceeding with a standalone deployment
                 * (without Control Tower)” [Next] button enabled {if they switch to true – change message to: ...install first}
                 *   5) Not Detected, home region supports CT, framework has ct:true – “It is recommended you install the
                 * Accelerator using Control Tower as a baseline, which requires installing Control Tower before running this Installer. To proceed without Control Tower, change to a Standalone installation” [Next Disabled] {if they switch the radio button, then enable the next button
                 *   6) Not Checked – Dependencies not validated [Next] enabled
                 */}
                <StatusIndicator type="info">
                  {state.controlTowerDetected
                    ? 'Control Tower installation detected. Installing using Control Tower as a baseline.'
                    : 'Control Tower installation not detected.'}
                </StatusIndicator>
                <EnumField
                  state={state}
                  node={ConfigurationNode.nested('installationType') as TypeTreeNode<t.EnumType<any>>}
                  disabled={state.controlTowerDetected}
                />
              </SpaceBetween>
            </FormField>
            <FormField label={'Accelerator input bucket name'} stretch>
              <StringField state={state} node={globalOptionsNode.nested('central-bucket')} />
              {state.bucketExists ? <StatusIndicator type="info">This bucket already exists.</StatusIndicator> : null}
            </FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Notifications</Header>}>
          <SpaceBetween size="xl" direction="vertical">
            <WizardField state={state} node={notificationsNode.nested('statusEmailAddress')} />
            <FormField label="Security notification email addresses" stretch>
              <Indent>
                <WizardField
                  node={securityEmailsNode.nested('High').nested(0)}
                  state={configuration}
                  context={{ label: 'High priority', description: '' }}
                />
                <WizardField
                  node={securityEmailsNode.nested('Medium').nested(0)}
                  state={configuration}
                  context={{ label: 'Medium priority', description: '' }}
                />
                <WizardField
                  node={securityEmailsNode.nested('Low').nested(0)}
                  state={configuration}
                  context={{ label: 'Low priority', description: '' }}
                />
              </Indent>
            </FormField>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
      <ImportModal visible={importVisible} onSubmit={handleImportSubmit} onDismiss={handleImportDismiss} />
    </>
  );
});

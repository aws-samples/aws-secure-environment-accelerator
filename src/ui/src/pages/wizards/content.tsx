/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import { Wizard, WizardProps } from '@awsui/components-react';
import { SyncObservable } from '@/components/accelerator-config-context';
import { ExportModal, useHandleExportSubmit } from '@/components/export-modal';
import { useLocalStorage } from '@/utils/hooks';
import {
  useWizardConfigurationObservable,
  useWizardObservable,
  WIZARD_CONFIGURATION_NAME,
  WIZARD_STATE_NAME,
} from './configuration';
import * as steps from './steps';

import './i18n';
import { removeDisabledObjects } from './util';

export default observer(function Content(): React.ReactElement {
  const state = useWizardObservable();
  const configuration = useWizardConfigurationObservable();
  const [activeStepIndex, setActiveStepIndex] = useLocalStorage('pbmm.step', 0);

  const [exportVisible, setExportDialogVisible] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | undefined>();
  const [exportValue, setExportValue] = useState<any>();

  const handleExportSubmit = useHandleExportSubmit({
    setExportDialogVisible,
    setExportLoading,
    setExportErrorMessage,
  });

  const handleExportDismiss = useCallback(() => {
    setExportDialogVisible(false);
  }, []);

  const wizardSteps = [
    {
      title: 'Configure global settings',
      content: <steps.ConfigureGlobalSettingsStep state={state} configuration={configuration} />,
    },
    {
      title: 'Select security guardrails',
      content: <steps.SelectGuardrailsStep configuration={configuration} />,
    },
    {
      title: 'Select security services',
      content: <steps.SelectSecurityServicesStep configuration={configuration} />,
    },
    {
      title: 'Structure organization',
      content: <steps.StructureOrganizationStep configuration={configuration} />,
    },
    {
      title: 'Configure network',
      content: <steps.ConfigureNetworkStep configuration={configuration} />,
    },
    {
      title: 'Configure active directory',
      content: <steps.ConfigureMadStep configuration={configuration} />,
    },
    {
      title: 'Review',
      content: <steps.ReviewStep state={state} configuration={configuration} />,
    },
  ];

  const handleSubmit = () => {
    // Remove __enabled === false
    setExportValue(removeDisabledObjects(configuration));
    setExportDialogVisible(true);
  };

  const handleNavigate: WizardProps['onNavigate'] = e => {
    console.log('onNavigate', e);
    // TODO Loading and validation
    setActiveStepIndex(e.detail.requestedStepIndex);
  };

  return (
    <>
      <SyncObservable name={WIZARD_STATE_NAME} />
      <SyncObservable name={WIZARD_CONFIGURATION_NAME} />
      <Wizard
        steps={wizardSteps}
        i18nStrings={{
          cancelButton: 'Cancel',
          nextButton: 'Next',
          previousButton: 'Previous',
          submitButton: 'Export',
          collapsedStepsLabel: (stepNumber, stepsCount) => `Step ${stepNumber} of ${stepsCount}`,
          stepNumberLabel: stepNumber => `Step ${stepNumber}`,
        }}
        activeStepIndex={activeStepIndex}
        onSubmit={handleSubmit}
        onNavigate={handleNavigate}
      />
      <ExportModal
        state={exportValue}
        visible={exportVisible}
        loading={exportLoading}
        errorMessage={exportErrorMessage}
        onDismiss={handleExportDismiss}
        onSubmit={handleExportSubmit}
      />
    </>
  );
});

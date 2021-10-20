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
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import { Wizard, WizardProps } from '@awsui/components-react';
import { SyncObservable, useObservable } from '@/components/accelerator-config-context';
import { ExportModal, useHandleExportSubmit } from '@/components/export-modal';
import { useStorage } from '@/utils/hooks';
import { useI18n } from '@/components/i18n-context';
import { removeDisabledObjects } from './util';
import { useWizardObservable, WIZARD_STATE_NAME } from './configuration';
import * as steps from './steps';

export default observer(function Content(): React.ReactElement {
  const state = useWizardObservable();
  const configuration = useObservable();
  const [activeStepIndex, setActiveStepIndex] = useStorage('pbmm.step', 0);
  const { tr } = useI18n();

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
      title: tr('wizard.steps.configure_global_settings'),
      content: <steps.ConfigureGlobalSettingsStep state={state} configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.select_security_guardrails'),
      content: <steps.SelectGuardrailsStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.select_security_services'),
      content: <steps.SelectSecurityServicesStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.structure_organization'),
      content: <steps.StructureOrganizationStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.structure_accounts'),
      content: <steps.StructureAccountStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.configure_network'),
      content: <steps.ConfigureNetworkStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.configure_ad'),
      content: <steps.ConfigureMadStep configuration={configuration} />,
    },
    {
      title: tr('wizard.steps.review'),
      content: <steps.ReviewStep state={state} configuration={configuration} />,
    },
  ];

  const handleSubmit = () => {
    setExportValue(removeDisabledObjects(configuration));
    setExportDialogVisible(true);
  };

  const handleNavigate: WizardProps['onNavigate'] = e => {
    // TODO Loading and validation
    setActiveStepIndex(e.detail.requestedStepIndex);
  };

  return (
    <>
      <SyncObservable name={WIZARD_STATE_NAME} />
      <Wizard
        steps={wizardSteps}
        i18nStrings={{
          cancelButton: tr('buttons.cancel'),
          nextButton: tr('buttons.next'),
          previousButton: tr('buttons.previous'),
          submitButton: tr('buttons.save'),
          // TODO Translations
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

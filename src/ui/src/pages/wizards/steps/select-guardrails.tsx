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
import * as t from '@aws-accelerator/common-types';
import { Box, Checkbox, CheckboxProps, Container, Header, SpaceBetween } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';

export interface SelectGuardrailsStepProps {
  configuration: any;
}

// prettier-ignore
const regionsNode = AcceleratorConfigurationNode
    .nested('global-options')
    .nested('supported-regions');

const optInRegions = ['af-south-1', 'ap-east-1', 'eu-south-1', 'me-south-1'];
const disabledRegions = ['us-gov-east-1', 'us-gov-west-1', 'cn-north-1', 'cn-northwest-1'];
const alwaysEnabledRegions = t.region.values.filter(
  region => !optInRegions.includes(region) && !disabledRegions.includes(region),
);

export const SelectGuardrailsStep = observer(function SelectGuardrailsStep({
  configuration,
}: SelectGuardrailsStepProps) {
  const { tr } = useI18n();

  return (
    <SpaceBetween size="xxl" direction="vertical">
      <Container
        header={
          <Header variant="h2" description={tr('wizard.headers.security_guardrails_always_on_desc')}>
            {tr('wizard.headers.security_guardrails_always_on')}
          </Header>
        }
      >
        <SpaceBetween size="xs" direction="vertical">
          <Box>{tr('wizard.labels.security_guardrails_always_on_text')}</Box>
          <SpaceBetween size="xxs" direction="vertical">
            {alwaysEnabledRegions.map(region => (
              <SecurityGuardRailRegion key={region} state={configuration} regionsNode={regionsNode} region={region} disable={false} />
            ))}
          </SpaceBetween>
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header variant="h2" description={tr('wizard.headers.security_guardrails_opt_in_desc')}>
            {tr('wizard.headers.security_guardrails_opt_in')}
          </Header>
        }
      >
        <SpaceBetween size="xs" direction="vertical">
          <Box>{tr('wizard.labels.security_guardrails_opt_in_text')}</Box>
          <SpaceBetween size="xxs" direction="vertical">
            {optInRegions.map(region => (
              <SecurityGuardRailRegion key={region} state={configuration} regionsNode={regionsNode} region={region} disable={true} />
            ))}
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
});

const SecurityGuardRailRegion = observer((props: { regionsNode: TypeTreeNode; state: any; region: string, disable: boolean }) => {
  const { region, regionsNode, state, disable} = props;
  const regions: any[] = regionsNode.get(state) ?? [];


  const handleChange: CheckboxProps['onChange'] = action(event => {
    let newRegions;
    if (regions.includes(region)) {
      newRegions = regions.filter(r => r !== region);
    } else {
      newRegions = [...regions, region];
    }
    regionsNode.set(state, newRegions);
  });

  return (
    <>
    { 
      disable !== true ? 
      <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={regions.includes(region)} onChange={handleChange} />
      <label>{region}</label>
    </SpaceBetween>
      : 
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={regions.includes(region)} onChange={handleChange} disabled />
      <label>{region}</label>
    </SpaceBetween>
    }   
    </>
 
  );
});

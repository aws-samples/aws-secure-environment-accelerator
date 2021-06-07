/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import * as t from '@aws-accelerator/common-types';
import { Box, Checkbox, CheckboxProps, Container, Header, SpaceBetween } from '@awsui/components-react';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';

export interface SelectGuardrailsStepProps {
  configuration: any;
}

// prettier-ignore
const regionsNode = AcceleratorConfigurationNode
    .nested('global-options')
    .nested('supported-regions');

export const SelectGuardrailsStep = observer(function SelectGuardrailsStep({
  configuration,
}: SelectGuardrailsStepProps) {
  return (
    <Container header={<Header variant="h2">Select security guardrails</Header>}>
      <SpaceBetween size="xs" direction="vertical">
        <Box variant="small">
          The proposed framework recommends deploying security guardrails in the following regions.
        </Box>
        <SpaceBetween size="xxs" direction="vertical">
          {t.region.values.map(region => (
            <SecurityGuardRailRegion key={region} state={configuration} regionsNode={regionsNode} region={region} />
          ))}
        </SpaceBetween>
      </SpaceBetween>
    </Container>
  );
});

const SecurityGuardRailRegion = observer((props: { regionsNode: TypeTreeNode; state: any; region: string }) => {
  const { region, regionsNode, state } = props;
  const regions: any[] = regionsNode.get(state);

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
    <SpaceBetween size="s" direction="horizontal">
      <Checkbox checked={regions.includes(region)} onChange={handleChange} />
      <label>{region}</label>
    </SpaceBetween>
  );
});

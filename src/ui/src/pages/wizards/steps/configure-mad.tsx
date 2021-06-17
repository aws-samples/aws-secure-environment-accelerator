/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { MadTable } from '../components/mad-table';

export interface ConfigureMadStepProps {
  configuration: any;
}

export const ConfigureMadStep = observer(function ConfigureMadStep({ configuration }: ConfigureMadStepProps) {
  return <MadTable state={configuration} />;
});

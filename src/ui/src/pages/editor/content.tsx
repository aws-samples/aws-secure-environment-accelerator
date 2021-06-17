/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { AceCodeEditor } from '@/components/ace-code-editor';

export interface ContentProps {
  value: string;
  onChange(value: string): void;
}

export default observer(function Content(props: ContentProps) {
  const handleChange = (value: string) => props.onChange(value);

  return <AceCodeEditor language="json" value={props.value} onChange={handleChange} />;
});

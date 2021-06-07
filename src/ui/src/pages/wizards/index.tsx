import { DefaultAppLayout } from '@/pages/default/app-layout';
import Content from './content';

export default function WizardsPage() {
  return (
    <DefaultAppLayout contentType="wizard">
      <Content />
    </DefaultAppLayout>
  );
}

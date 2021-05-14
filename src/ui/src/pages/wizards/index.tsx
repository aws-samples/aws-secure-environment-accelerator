import { DefaultAppLayout } from '@/pages/default/app-layout';
import Content from './content';

export type { AcceleratorComponentState } from './content';

export default function WizardsPage() {
  return (
    <DefaultAppLayout>
      <Content />
    </DefaultAppLayout>
  );
}

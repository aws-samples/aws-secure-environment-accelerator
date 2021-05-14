/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAcceleratorConfig } from '@/components/accelerator-config-context';
import { DefaultAppLayout } from '@/pages/default/app-layout';
import Tools from './tools';
import Content from './content';
import Breadcrumbs from './breadcrumbs';

export default function AdvancedPage() {
  const state = useAcceleratorConfig();

  return (
    <DefaultAppLayout breadcrumbs={<Breadcrumbs />} tools={<Tools state={state} />}>
      <Content state={state} />
    </DefaultAppLayout>
  );
}

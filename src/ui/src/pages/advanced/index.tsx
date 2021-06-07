/* eslint-disable @typescript-eslint/no-explicit-any */
import { useObservable } from '@/components/accelerator-config-context';
import { DefaultAppLayout } from '@/pages/default/app-layout';
import Tools from './tools';
import Content from './content';
import Breadcrumbs from './breadcrumbs';

export default function AdvancedPage() {
  const state = useObservable();

  return (
    <DefaultAppLayout breadcrumbs={<Breadcrumbs />} tools={<Tools state={state} />}>
      <Content state={state} />
    </DefaultAppLayout>
  );
}

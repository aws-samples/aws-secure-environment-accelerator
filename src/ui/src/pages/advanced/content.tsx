/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Container, Header } from '@awsui/components-react';
import { NestedField } from '@/components/fields';
import { getNodeAtPath } from '@/types';
import { useI18n } from '@/components/i18n-context';
import { usePathHistory } from '@/utils/hooks';
import { root } from './root';

export default function Content({ state }: { state: any }): React.ReactElement {
  const history = usePathHistory();
  const node = getNodeAtPath(root, history.path);
  const { tr } = useI18n();
  const { title, description } = tr(node);

  const header = (
    <Header variant="h2" description={description}>
      {title}
    </Header>
  );

  return (
    <>
      <Container header={header}>
        <NestedField node={node} state={state} />
      </Container>
    </>
  );
}

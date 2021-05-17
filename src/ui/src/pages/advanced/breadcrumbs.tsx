/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Box, BreadcrumbGroup, BreadcrumbGroupProps, Button, SpaceBetween } from '@awsui/components-react';
import { getNodeAtPath, TypeTreeNode } from '@/types';
import { usePathHistory } from '@/utils/hooks';
import { useI18n } from '@/components/i18n-context';
import { useUi } from '@/components/ui-context';
import { root } from './root';

export default function Breadcrumbs(): React.ReactElement {
  const { setImportDialogVisible, setExportDialogVisible } = useUi();
  const { tr } = useI18n();
  const history = usePathHistory();
  const node = getNodeAtPath(root, history.path);

  const breadcrumbs: BreadcrumbGroupProps.Item[] = [];
  let current: TypeTreeNode | undefined = node;
  while (current) {
    const { tr } = useI18n();
    const { label, title } = tr(current);
    breadcrumbs.unshift({
      text: label ?? title,
      href: history.createHref(current.path),
    });
    current = current.parent;
  }

  return (
    <>
      <Box float="left">
        <BreadcrumbGroup items={breadcrumbs} />
      </Box>
      <Box float="right">
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => setImportDialogVisible(true)}>{tr('buttons.import')}</Button>
          <Button onClick={() => setExportDialogVisible(true)} variant="primary">
            {tr('buttons.export')}
          </Button>
        </SpaceBetween>
      </Box>
      <div style={{ clear: 'both' }} />
    </>
  );
}

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

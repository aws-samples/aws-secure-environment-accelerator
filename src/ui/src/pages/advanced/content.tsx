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

  return (
    <Container
      header={
        <Header variant="h2" description={description}>
          {title}
        </Header>
      }
    >
      <NestedField node={node} state={state} />
    </Container>
  );
}

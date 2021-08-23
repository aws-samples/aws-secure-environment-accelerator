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
import { Box, SideNavigation, SpaceBetween } from '@awsui/components-react';
import { usePathHistory } from '@/utils/hooks';
import { LanguagePicker } from '@/components/language-picker';
import { useI18n } from '@/components/i18n-context';

export function DefaultNavigation(): React.ReactElement {
  const { tr } = useI18n();
  const history = usePathHistory();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flexGrow: 1 }}>
        <SideNavigation
          header={{ href: '#/', text: tr('menu.accelerator_configuration') }}
          items={[
            {
              type: 'link',
              text: tr('menu.wizard'),
              href: '#/wizard',
            },
            {
              type: 'link',
              text: tr('menu.graphical_editor'),
              href: history.createHref([]),
            },
            {
              type: 'link',
              text: tr('menu.code_editor'),
              href: '#/editor',
            },
          ]}
        />
      </div>
      <div style={{ justifySelf: 'end' }}>
        <Box padding={{ horizontal: 'xxl', bottom: 'xxl' }}>
          <SpaceBetween direction="vertical" size="xxs">
            <Box>{tr('labels.choose_language')}</Box>
            <LanguagePicker />
          </SpaceBetween>
        </Box>
      </div>
    </div>
  );
}

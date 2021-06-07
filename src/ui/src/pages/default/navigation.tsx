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
              text: tr('menu.graphical_editor'),
              href: history.createHref([]),
            },
            {
              type: 'link',
              text: tr('menu.code_editor'),
              href: '#/editor',
            },
            {
              type: 'link',
              text: tr('menu.wizard'),
              href: '#/wizard',
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

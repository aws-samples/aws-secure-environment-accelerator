/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Box, SideNavigation, SpaceBetween } from '@awsui/components-react';
import { usePathHistory } from '@/utils/hooks';
import { LanguagePicker } from '@/components/language-picker';

export function DefaultNavigation(): React.ReactElement {
  const history = usePathHistory();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flexGrow: 1 }}>
        <SideNavigation
          header={{ href: '#/', text: 'Accelerator Configuration' }}
          items={[
            {
              type: 'link',
              text: 'Graphical Editor',
              href: history.createHref([]),
            },
            {
              type: 'link',
              text: 'Code Editor',
              href: '#/editor',
            },
            {
              type: 'link-group',
              text: 'Wizards',
              href: '#/wizards',
              items: [
                {
                  type: 'link',
                  text: 'PBMM',
                  href: '#/wizards/pbmm',
                },
                {
                  type: 'link',
                  text: 'NIST',
                  href: '#/wizards/nist',
                },
              ],
            },
          ]}
        />
      </div>
      <div style={{ justifySelf: 'end' }}>
        <Box padding={{ horizontal: 'xxl', bottom: 'xxl' }}>
          <SpaceBetween direction="vertical" size="xxs">
            <Box>Choose language</Box>
            <LanguagePicker />
          </SpaceBetween>
        </Box>
      </div>
    </div>
  );
}

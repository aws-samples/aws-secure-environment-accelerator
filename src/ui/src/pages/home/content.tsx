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

import React from 'react';
import { AppLayout, Box, Button, Container, Grid, SpaceBetween } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';

import './content.scss';

const Content: React.VFC = () => {
  const { tr } = useI18n();

  return (
    <Box margin={{ bottom: 'l' }}>
      <div className="custom-home__header">
        <Box padding={{ vertical: 'xxl', horizontal: 's' }}>
          <Grid
            gridDefinition={[
              { offset: { l: 2, xxs: 1 }, colspan: { l: 8, xxs: 10 } },
              { colspan: { xl: 6, l: 5, s: 6, xxs: 10 }, offset: { l: 2, xxs: 1 } },
              { colspan: { xl: 2, l: 3, s: 4, xxs: 10 }, offset: { s: 0, xxs: 1 } },
            ]}
          >
            <Box fontWeight="light" padding={{ top: 'xs' }}>
              <span className="custom-home__category">{tr('splash.category')}</span>
            </Box>
            <div className="custom-home__header-title">
              <Box variant="h1" fontWeight="bold" padding="n" fontSize="display-l" color="inherit">
                {tr('splash.title')}
              </Box>
              <Box fontWeight="light" padding={{ bottom: 's' }} fontSize="display-l" color="inherit">
                {tr('splash.subtitle')}
              </Box>
              <Box variant="p" fontWeight="light">
                <span className="custom-home__header-sub-title">{tr('splash.description')}</span>
              </Box>
            </div>
            <Container>
              <SpaceBetween size="xl">
                <Box variant="h2" padding="n">
                  {tr('splash.create_configuration')}
                </Box>
                <Button href="#/wizard" variant="primary">
                  {tr('splash.next_step')}
                </Button>
              </SpaceBetween>
            </Container>
          </Grid>
        </Box>
      </div>
    </Box>
  );
};

export function HomePage() {
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  return (
    <AppLayout
      disableContentPaddings={true}
      content={<Content />}
      navigationOpen={navigationOpen}
      onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
      toolsHide={true}
    />
  );
}

export default Content;

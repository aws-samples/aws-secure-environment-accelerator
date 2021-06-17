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

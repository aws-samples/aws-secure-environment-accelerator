import React from 'react';
import {
  AppLayout,
  Box,
  Button,
  ColumnLayout,
  Container,
  Grid,
  Header,
  Icon,
  SpaceBetween,
} from '@awsui/components-react';
import { usePathHistory } from '@/utils/hooks';

import './content.scss';

const Content: React.VFC = () => {
  const history = usePathHistory();

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
              <span className="custom-home__category">Management &amp; Governance</span>
            </Box>
            <div className="custom-home__header-title">
              <Box variant="h1" fontWeight="bold" padding="n" fontSize="display-l" color="inherit">
                Secure Environment Accelerator
              </Box>
              <Box fontWeight="light" padding={{ bottom: 's' }} fontSize="display-l" color="inherit">
                Deploy and operate secure multi-account, multi-region environments
              </Box>
              <Box variant="p" fontWeight="light">
                <span className="custom-home__header-sub-title">
                  The AWS Accelerator is a tool designed to help deploy and operate secure multi-account, multi-region
                  AWS environments on an ongoing basis. The power of the solution is the configuration file that drives
                  the architecture deployed by the tool. This enables extensive flexibility and for the completely
                  automated deployment of a customized architecture within AWS without changing a single line of code.
                </span>
              </Box>
            </div>
            <Container>
              <SpaceBetween size="xl">
                <Box variant="h2" padding="n">
                  Create configuration
                </Box>
                <Button href={history.createHref([])} variant="primary">
                  Next step
                </Button>
              </SpaceBetween>
            </Container>
          </Grid>
        </Box>
      </div>

      <Box margin={{ top: 's' }} padding={{ top: 'xxl', horizontal: 's' }}>
        <Grid
          gridDefinition={[
            { colspan: { xl: 6, l: 5, s: 6, xxs: 10 }, offset: { l: 2, xxs: 1 } },
            { colspan: { xl: 2, l: 3, s: 4, xxs: 10 }, offset: { s: 0, xxs: 1 } },
          ]}
        >
          <div className="custom-home-main-content-area">
            <SpaceBetween size="l">
              <div>
                <Box fontSize="heading-xl" fontWeight="normal" variant="h2">
                  How it works
                </Box>
                <Container>
                  <div className="custom-home-image__placeholder" />
                </Container>
              </div>

              <div>
                <Box fontSize="heading-xl" fontWeight="normal" variant="h2">
                  Benefits and features
                </Box>
                <Container>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        CloudFront console
                      </Box>
                      <Box variant="p">
                        Create, monitor, and manage your content delivery with a few simple clicks on the CloudFront
                        console.
                      </Box>
                    </div>
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        Static and dynamic content
                      </Box>
                      <Box variant="p">
                        Deliver both static content and dynamic content that you can personalize for individual users.
                      </Box>
                    </div>
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        Reporting and analytics
                      </Box>
                      <Box variant="p">
                        Get detailed cache statistics reports, monitor your CloudFront usage in near real-time, track
                        your most popular objects, and set alarms on operational metrics.
                      </Box>
                    </div>
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        Tools and libraries
                      </Box>
                      <Box variant="p">
                        Take advantage of a variety of tools and libraries for managing your CloudFront distribution,
                        like the CloudFront API, the AWS Command Line Interface (AWS CLI), and the AWS SDKs.
                      </Box>
                    </div>
                  </ColumnLayout>
                </Container>
              </div>
              <div>
                <Box fontSize="heading-xl" fontWeight="normal" variant="h2">
                  Use cases
                </Box>
                <Container>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        Configure multiple origins
                      </Box>
                      <Box variant="p">
                        Configure multiple origin servers and multiple cache behaviors based on URL path patterns on
                        your website. Use AWS origins such as Amazon S3 or Elastic Load Balancing, and add your own
                        custom origins to the mix.
                      </Box>
                      {/* <Link href="#" {...externalLinkProps}>
                        Learn more
                      </Link> */}
                    </div>
                    <div>
                      <Box variant="h3" padding={{ top: 'n' }}>
                        Deliver streaming video
                      </Box>
                      <Box variant="p">
                        Use CloudFront to deliver on-demand video without the need to set up or operate any media
                        servers. CloudFront supports multiple protocols for media streaming.
                      </Box>
                      {/* <Link href="#" {...externalLinkProps}>
                        Learn more
                      </Link> */}
                    </div>
                  </ColumnLayout>
                </Container>
              </div>
              <Container header={<Header variant="h2">Related services</Header>}>
                <ColumnLayout columns={2} variant="text-grid">
                  <div>
                    <Box variant="h3" padding={{ top: 'n' }}>
                      {/* <Link fontSize="heading-m" href="#" {...externalLinkProps}>
                        Amazon S3
                      </Link> */}
                    </Box>
                    <Box variant="p">Use Amazon S3 to store the content that CloudFront delivers.</Box>
                  </div>
                  <div>
                    <Box variant="h3" padding={{ top: 'n' }}>
                      {/* <Link fontSize="heading-m" href="#" {...externalLinkProps}>
                        Amazon Route 53
                      </Link> */}
                    </Box>
                    <Box variant="p">
                      Use Amazon Route 53 to route DNS queries for your domain name to your CloudFront distribution.
                    </Box>
                  </div>
                </ColumnLayout>
              </Container>
            </SpaceBetween>
          </div>
          <div className="custom-home__sidebar">
            <SpaceBetween size="xxl">
              <Container header={<Header variant="h2">Pricing (US)</Header>}>
                <ul aria-label="Pricing details" className="custom-list-separator">
                  <li>
                    <span>10 TB/month</span>
                    <Box variant="span" color="text-body-secondary">
                      $0.085 per GB
                    </Box>
                  </li>
                  <li>
                    <span>100 TB/month</span>
                    <Box variant="span" color="text-body-secondary">
                      $0.065 per GB
                    </Box>
                  </li>
                  <li>
                    <span>524 TB/month</span>
                    <Box variant="span" color="text-body-secondary">
                      $0.035 per GB
                    </Box>
                  </li>
                  <li>
                    <span>4 PB/month</span>
                    <Box variant="span" color="text-body-secondary">
                      $0.025 per GB
                    </Box>
                  </li>
                  <li>
                    {/* <Link href="#" {...externalLinkProps}>
                      Cost calculator
                    </Link> */}
                  </li>
                </ul>
              </Container>

              <Container
                header={
                  <Header variant="h2">
                    Getting started <Icon name="external" />
                  </Header>
                }
              >
                <ul aria-label="Getting started documentation" className="custom-list-separator">
                  {/* <li>
                    <ExternalLinkItem
                      href="https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html"
                      text="What is Amazon CloudFront?"
                    />
                  </li>
                  <li>
                    <ExternalLinkItem
                      href="https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.html"
                      text="Getting started with CloudFront"
                    />
                  </li>
                  <li>
                    <ExternalLinkItem
                      href="https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.html"
                      text="Working with CloudFront distributions"
                    />
                  </li> */}
                </ul>
              </Container>

              <Container
                header={
                  <Header variant="h2">
                    More resources <Icon name="external" />
                  </Header>
                }
              >
                <ul aria-label="Additional resource links" className="custom-list-separator">
                  {/* <li>
                    <ExternalLinkItem href="https://aws.amazon.com/documentation/cloudfront/" text="Documentation" />
                  </li>
                  <li>
                    <ExternalLinkItem href="#" text="FAQ" />
                  </li>
                  <li>
                    <ExternalLinkItem href="#" text="CloudFront forum" />
                  </li>
                  <li>
                    <ExternalLinkItem href="#" text="Contact us" />
                  </li> */}
                </ul>
              </Container>
            </SpaceBetween>
          </div>
        </Grid>
      </Box>
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

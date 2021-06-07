/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { Container, Header, SpaceBetween } from '@awsui/components-react';

export interface ReviewStepProps {
  state: any;
  configuration: any;
}

export const ReviewStep = observer(function ReviewStep({ state, configuration }: ReviewStepProps) {
  return (
    <>
      <SpaceBetween size="xxl">
        <Container header={<Header variant="h2">Review</Header>}>
          <SpaceBetween size="xl" direction="vertical"></SpaceBetween>
        </Container>
      </SpaceBetween>
    </>
  );
});

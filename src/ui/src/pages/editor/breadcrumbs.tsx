import { Box, Button, SpaceBetween } from '@awsui/components-react';

export interface BreadcrumbsProps {
  onReset(): void;
  onSave(): void;
}

export default function Breadcrumbs(props: BreadcrumbsProps) {
  return (
    <div>
      <Box float="right">
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={props.onReset}>Reset</Button>
          <Button onClick={props.onSave} variant="primary">
            Save
          </Button>
        </SpaceBetween>
      </Box>
      <div style={{ clear: 'both' }} />
    </div>
  );
}

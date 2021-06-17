import { Icon, Popover } from '@awsui/components-react';

export const LabelWithDescription: React.VFC<{ label: string; description?: string }> = ({ label, description }) =>
  description ? (
    <Popover dismissButton={false} position="top" size="small" triggerType="custom" content={description}>
      {label} <Icon name="status-info" variant="subtle" />
    </Popover>
  ) : (
    <>{label}</>
  );

import { Box } from '@awsui/components-react';

export const ValueWithLabel: React.FC<{ label: string }> = ({ label, children }) => (
  <div>
    <Box margin={{ bottom: 'xxxs' }} color="text-label">
      {label}
    </Box>
    <div>{children}</div>
  </div>
);

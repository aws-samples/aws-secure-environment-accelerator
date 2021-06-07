import React from 'react';
import { colorBorderDividerDefault } from '@awsui/design-tokens';

export const Indent: React.FC = ({ children }) => (
  <div style={{ paddingLeft: '10px', borderLeft: `3px solid ${colorBorderDividerDefault}` }}>{children}</div>
);

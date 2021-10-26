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

import { useStorage } from '@/utils/hooks';
import { AppLayout, AppLayoutProps } from '@awsui/components-react';
import { DefaultNavigation } from './navigation';

export type DefaultAppLayoutProps = Omit<
  AppLayoutProps,
  'content' | 'navigationOpen' | 'onNavigationChange' | 'onToolsChange' | 'toolsOpen'
>;

export const DefaultAppLayout: React.FC<DefaultAppLayoutProps> = props => {
  const [toolsOpen, setToolsOpen] = useStorage('advanced.tools.open', false);
  const [navigationOpen, setNavigationOpen] = useStorage('advanced.navigation.open', true);

  const handleNavigationChange: AppLayoutProps['onNavigationChange'] = e => setNavigationOpen(e.detail.open);
  const handleToolsChange: AppLayoutProps['onToolsChange'] = e => setToolsOpen(e.detail.open);

  return (
    <AppLayout
      {...props}
      navigation={props.navigation ?? <DefaultNavigation />}
      navigationOpen={navigationOpen}
      content={props.children}
      toolsOpen={toolsOpen}
      toolsHide={!props.tools}
      onNavigationChange={handleNavigationChange}
      onToolsChange={handleToolsChange}
    />
  );
};

import { useLocalStorage } from '@/utils/hooks';
import { AppLayout, AppLayoutProps } from '@awsui/components-react';
import { DefaultNavigation } from './navigation';

export type DefaultAppLayoutProps = Omit<
  AppLayoutProps,
  'content' | 'navigationOpen' | 'onNavigationChange' | 'onToolsChange' | 'toolsOpen'
>;

export const DefaultAppLayout: React.FC<DefaultAppLayoutProps> = props => {
  const [toolsOpen, setToolsOpen] = useLocalStorage('advanced.tools.open', false);
  const [navigationOpen, setNavigationOpen] = useLocalStorage('advanced.navigation.open', true);

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

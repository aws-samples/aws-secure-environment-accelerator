import { HashRouter, Route, Switch } from 'react-router-dom';
import { AwsCredentialsProvider } from '@/components/aws-credentials-context';
import { AcceleratorConfigProvider, SyncAcceleratorConfig } from '@/components/accelerator-config-context';
import { ReplacementsContext } from '@/components/replacements-context';
import { ScrollToTop } from '@/components/scroll-to-top';
import { UiProvider } from '@/components/ui-context';
import { I18nProvider } from './components/i18n-context';
import HomePage from '@/pages/home';
import AdvancedPage from '@/pages/advanced';
import EditorPage from '@/pages/editor';
import WizardsPage from '@/pages/wizards';

function App() {
  return (
    <I18nProvider>
      <AwsCredentialsProvider>
        <AcceleratorConfigProvider>
          <SyncAcceleratorConfig />
          <ReplacementsContext>
            <HashRouter>
              <UiProvider>
                <ScrollToTop />
                <Switch>
                  <Route path="/advanced/:path?">
                    <AdvancedPage />
                  </Route>
                  <Route path="/editor">
                    <EditorPage />
                  </Route>
                  <Route path="/wizards">
                    <WizardsPage />
                  </Route>
                  <Route>
                    <HomePage />
                  </Route>
                </Switch>
              </UiProvider>
            </HashRouter>
          </ReplacementsContext>
        </AcceleratorConfigProvider>
      </AwsCredentialsProvider>
    </I18nProvider>
  );
}

export default App;

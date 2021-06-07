import { en } from '@aws-accelerator/config-i18n';
import * as c from './configuration';

const tr = en.add.bind(en);

tr(c.Configuration, {
  fields: {
    region: { title: 'Region' },
    authenticated: { title: 'Authenticated' },
    controlTowerDetected: { title: 'Control tower detected' },
    notifications: { title: 'Notifications' },
    installationType: { title: 'Installation type' },
    bucketExists: { title: 'Bucket exists' },
  },
});

tr(c.Configuration.props.notifications, {
  fields: {
    statusEmailAddress: { title: 'Status notification email address' },
  },
});

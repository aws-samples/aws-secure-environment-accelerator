/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { observer } from 'mobx-react-lite';
import { SideNavigation, SideNavigationProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { useI18n } from '@/components/i18n-context';
import { usePathHistory } from '@/utils/hooks';
import { toArray, toObject } from '@/utils/cast';
import { getNodeAtPath } from '@/types';
import { root } from './root';

export default observer(function Tools({ state }: { state: any }): React.ReactElement {
  const history = usePathHistory();
  const node = getNodeAtPath(root, history.path);
  const { tr } = useI18n();
  const { path } = node;

  let keys: string[] | number[] | undefined;
  if (node.rawType instanceof t.InterfaceType) {
    keys = Object.keys(node.rawType.props);
  } else if (node.rawType instanceof t.DictionaryType) {
    const value = toObject(node.get(state));
    keys = Object.keys(value);
  } else if (node.rawType instanceof t.ArrayType) {
    const value = toArray(node.get(state));
    keys = Array.from(value.keys());
  }

  let items: SideNavigationProps.Item[] = [];
  if (keys) {
    items = keys.map(
      (key: string | number): SideNavigationProps.Item => {
        const nested = node.nested(key);
        const { title } = tr(nested);
        return {
          href: history.createHref(nested.path),
          type: 'link',
          text: title,
        };
      },
    );
  }
  return <SideNavigation header={{ href: history.createHref(path), text: tr('menu.properties') }} items={items} />;
});

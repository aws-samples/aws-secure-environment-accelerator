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

import { render, screen } from '@testing-library/react';
import * as t from '@aws-accelerator/common-types';
import { getTypeTree, TypeTreeNode } from '@/types';
import { I18nProvider, useI18n } from './i18n-context';
import { en } from '@aws-accelerator/config-i18n';

const nested = t.interface({
  pool: t.nonEmptyString,
  size: t.number,
});

const type = t.interface({
  name: t.string,
  unnamed: t.string,
  array: t.array(t.string),
  record: t.record(t.string, t.string),
  nestedArray: t.array(nested),
});
const root = getTypeTree(type);

describe('useI18n', () => {
  beforeAll(() => {
    en.add(type, {
      title: 'Configuration',
      fields: {
        name: { title: 'Name' },
        unnamed: {},
        array: { title: 'Array' },
        record: { title: 'Record' },
        nestedArray: { title: 'Nested Array' },
      },
    });
  });

  en.add(nested, {
    fields: {
      pool: { title: 'Pool' },
      size: { title: 'Size' },
    },
  });

  test('should render the correct title for the root', () => {
    render(
      <I18nProvider>
        <TitleRenderer node={root} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Configuration/)).toBeTruthy();
  });

  test('should render the correct title for the name field', () => {
    render(
      <I18nProvider>
        <TitleRenderer node={root.nested('name')} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Name/)).toBeTruthy();
  });

  test('should render the correct title for the unnamed field', () => {
    render(
      <I18nProvider>
        <TitleRenderer node={root.nested('unnamed')} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Unnamed/)).toBeTruthy();
  });

  test('should render the correct description for the array field', () => {
    render(
      <I18nProvider>
        <DescriptionRenderer node={root.nested('array').nested(1)} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Element with index "1"/)).toBeTruthy();
  });

  test('should render the correct description for the record field', () => {
    render(
      <I18nProvider>
        <DescriptionRenderer node={root.nested('record').nested('thekey')} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Element with key "thekey"/)).toBeTruthy();
  });

  test('should render the correct title for the nested array string field', () => {
    render(
      <I18nProvider>
        <TitleRenderer node={root.nested('nestedArray').nested(0).nested('pool')} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Pool/)).toBeTruthy();
  });

  test('should render the correct title for the nested array number field', () => {
    render(
      <I18nProvider>
        <TitleRenderer node={root.nested('nestedArray').nested(0).nested('size')} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Size/)).toBeTruthy();
  });
});

const TitleRenderer = ({ node }: { node: TypeTreeNode }) => {
  const { tr } = useI18n();
  const { title } = tr(node);
  return <span>{title}</span>;
};

const DescriptionRenderer = ({ node }: { node: TypeTreeNode }) => {
  const { tr } = useI18n();
  const { description } = tr(node);
  return <span>{description}</span>;
};

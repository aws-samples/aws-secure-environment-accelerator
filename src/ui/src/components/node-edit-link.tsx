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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo } from 'react';
import { Button, Icon } from '@awsui/components-react';
import { usePathHistory } from '@/utils/hooks';
import { Path } from './fields';
import { useI18n } from './i18n-context';

/**
 * This functional component renders an "Edit" button that navigates to the given path.
 */
export const NodeEditLink = memo(
  function NodeEditLink(props: { path: Path }) {
    const { path } = props;
    const { tr } = useI18n();
    const history = usePathHistory();
    const href = history.createHref(path);

    return (
      <Button
        href={href}
        onClick={event => {
          // Workaround to push to history
          // Default behavior of just clicking the anchor is to pop
          event.preventDefault();
          event.stopPropagation();
          history.push(path);
        }}
      >
        <Icon name="edit" />
        {tr('buttons.edit')}
      </Button>
    );
  },
  (prevProps, nextProps) => prevProps.path !== nextProps.path,
);

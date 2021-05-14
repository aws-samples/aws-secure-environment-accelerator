/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo } from 'react';
import { Button, Icon } from '@awsui/components-react';
import { usePathHistory } from '@/utils/hooks';
import { Path } from './fields';

/**
 * This functional component renders an "Edit" button that navigates to the given path.
 */
export const NodeEditLink = memo(
  function NodeEditLink(props: { path: Path }) {
    const { path } = props;
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
        Edit
      </Button>
    );
  },
  (prevProps, nextProps) => prevProps.path !== nextProps.path,
);

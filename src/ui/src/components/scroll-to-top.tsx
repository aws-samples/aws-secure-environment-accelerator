import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

/**
 * This functional components makes sure to scroll to top when history is pushed or replaced.
 */
export function ScrollToTop() {
  const history = useHistory();

  useEffect(() => {
    const dispose = history.listen((_, action) => {
      // Only scroll when not popping something from history
      if (action !== 'POP') {
        window.scrollTo(0, 0);
      }
    });
    return () => dispose();
  }, []);

  return null;
}

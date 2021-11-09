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

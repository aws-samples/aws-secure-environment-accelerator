function defaultEquality<T>(a: T, b: T) {
  return a === b;
}

export function arrayMax<T>(array: T[], compare: (a: T, b: T) => number): T | undefined {
  let maxValue: T | undefined;
  for (const value of array) {
    if (!maxValue || compare(value, maxValue) > 0) {
      maxValue = value;
    }
  }
  return maxValue;
}

/**
 * Returns true if both list `a` and `b` contain the same elements.
 *
 * @param a List to compare
 * @param b List that is compared
 * @param equality Function to check if elements equal
 */
export function arrayEqual<T>(
  a: T[] | undefined,
  b: T[] | undefined,
  equality: (a: T, b: T) => boolean = defaultEquality,
) {
  if (a === undefined) {
    return b === undefined;
  } else if (b === undefined) {
    return false;
  } else if (a.length !== b.length) {
    return false;
  }

  for (const ca of a) {
    const found = b.find(cb => equality(ca, cb));
    if (!found) {
      console.debug(`Element ${ca} not found in array`);
      return false;
    }
  }
  return true;
}

export function collect<T>(values: Iterable<T>): T[] {
  const result = [];
  for (const value of values) {
    result.push(value);
  }
  return result;
}

export async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

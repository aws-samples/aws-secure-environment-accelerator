/**
 * Remove special characters from the start and end of a string.
 *
 * TODO Move this to a common library.
 */
export function trimSpecialCharacters(str: string) {
  return str.replace(/^[^a-z\d]*|[^a-z\d]*$/gi, '');
}

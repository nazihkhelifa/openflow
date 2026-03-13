/**
 * Parses inline <var="name">value</var> tags from text.
 * Returns an array of { name, value } pairs.
 */
export function parseVarTags(text: string): Array<{ name: string; value: string }> {
  const regex = /<var="(\w+)">([\s\S]*?)<\/var>/g;
  const vars: Array<{ name: string; value: string }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.push({ name: match[1], value: match[2] });
  }
  return vars;
}

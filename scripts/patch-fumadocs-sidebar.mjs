// Fumadocs 16.17.5 opens active ancestors even with defaultOpen=false.
// Let an explicit folder preference take precedence; retain upstream defaults
// when the preference is omitted. Recheck this small workaround on upgrades.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(import.meta.resolve('fumadocs-ui/components/sidebar/base'));
const original = 'collapsible === false || active || (defaultOpenProp ?? defaultOpenLevel >= depth)';
const replacement = 'collapsible === false || (defaultOpenProp ?? (active || defaultOpenLevel >= depth))';
const source = await readFile(path, 'utf8');
if (!source.includes(original) && !source.includes(replacement)) {
  throw new Error('Fumadocs sidebar changed; review the explicit defaultOpen preference patch.');
}
if (source.includes(original)) await writeFile(path, source.replace(original, replacement));
console.log('[fumadocs] Explicit folder defaultOpen preference verified.');

import { createHash } from 'node:crypto';

/** The exact identity used by both the web question and the Android export. */
export function questionRevision(node, source) {
  const first = node.children?.[0]?.position?.start.offset;
  const last = node.children?.at(-1)?.position?.end.offset;
  const body = first === undefined || last === undefined ? '' : source.slice(first, last);
  const text = (name) => {
    const value = node.attributes?.find((attribute) => attribute.name === name)?.value;
    return typeof value === 'string' ? value : value?.value.trim() ?? '';
  };
  return createHash('sha1').update(`${text('type')}\n${text('answer')}\n${body}`).digest('hex').slice(0, 8);
}

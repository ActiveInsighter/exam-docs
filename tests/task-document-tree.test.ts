import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const taskRoot = join(process.cwd(), 'content', 'docs', 'tasks');
const taskKey = 'zdq8leb1t8';
const publishedTaskRoot = join(taskRoot, taskKey);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('published task document tree', () => {
  it('exposes the imported task as a root documentation module', () => {
    const rootMeta = readJson(join(taskRoot, 'meta.json'));
    const taskMeta = readJson(join(publishedTaskRoot, 'meta.json'));

    expect(rootMeta.root).toBe(true);
    expect(rootMeta.pages).toEqual(['index', taskKey]);
    expect(taskMeta.pages).toEqual(['index', 'events']);
  });

  it('keeps event, act, and message navigation aligned with the archive', () => {
    const eventRoot = join(publishedTaskRoot, 'events', 'cqlzht1rvkvpp7m');
    const actsRoot = join(eventRoot, 'acts');

    expect(readJson(join(eventRoot, 'meta.json')).pages).toEqual(['index', 'acts']);
    expect(readJson(join(actsRoot, 'meta.json')).pages).toEqual([
      'lfjx3cct39emg07',
      'ew5289gv8ayx6ve',
      'cdu6vd3u3lq69sj',
    ]);

    const expectedActs = [
      ['lfjx3cct39emg07', 8],
      ['ew5289gv8ayx6ve', 7],
      ['cdu6vd3u3lq69sj', 2],
    ] as const;

    for (const [actKey, messageCount] of expectedActs) {
      const actRoot = join(actsRoot, actKey);
      const messageMeta = readJson(join(actRoot, 'messages', 'meta.json'));
      const messageFiles = readdirSync(join(actRoot, 'messages'))
        .filter((name) => name.endsWith('.mdx'))
        .sort();

      expect(readJson(join(actRoot, 'meta.json')).pages).toEqual(['index', 'messages']);
      expect(messageMeta.pages).toHaveLength(messageCount);
      expect(messageFiles).toHaveLength(messageCount);
      for (const file of messageFiles) {
        const content = readFileSync(join(actRoot, 'messages', file), 'utf8');
        expect(content).toMatch(/^---\ntitle: /u);
        expect(content).toMatch(/\ndescription: /u);
      }
    }
  });
});

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeStaticBuildId } from '../scripts/static-build-id.mjs';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'exam-static-id-'));
  roots.push(root);
  await mkdir(path.join(root, 'app'), { recursive: true });
  await mkdir(path.join(root, 'components'), { recursive: true });
  await mkdir(path.join(root, 'content', 'docs'), { recursive: true });
  await mkdir(path.join(root, 'content', 'blog'), { recursive: true });
  await writeFile(path.join(root, 'app', 'page.tsx'), 'export default function Page(){return null}\n');
  await writeFile(path.join(root, 'components', 'shell.tsx'), 'export const Shell = () => null;\n');
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(path.join(root, 'content', 'docs', 'a.md'), '# A\nbody one\n');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('static shell build id', () => {
  it('stays stable for a documentation body-only edit', async () => {
    const root = await fixture();
    const before = await computeStaticBuildId(root);
    await writeFile(path.join(root, 'content', 'docs', 'a.md'), '# A\ncompletely different body\n');
    expect(await computeStaticBuildId(root)).toBe(before);
  });

  it('changes when the shared application shell changes', async () => {
    const root = await fixture();
    const before = await computeStaticBuildId(root);
    await writeFile(path.join(root, 'components', 'shell.tsx'), 'export const Shell = () => <main />;\n');
    expect(await computeStaticBuildId(root)).not.toBe(before);
  });

  it('changes when the static route set changes', async () => {
    const root = await fixture();
    const before = await computeStaticBuildId(root);
    await writeFile(path.join(root, 'content', 'docs', 'b.md'), '# B\n');
    expect(await computeStaticBuildId(root)).not.toBe(before);
  });
});

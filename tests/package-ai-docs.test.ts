import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error The packaging script is intentionally plain Node.js ESM.
import { packageAiDocs } from '../scripts/package-ai-docs.mjs';

const tempRoots: string[] = [];

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'exam-docs-ai-'));
  tempRoots.push(root);

  await mkdir(path.join(root, 'content', 'docs', 'chapter'), { recursive: true });
  await mkdir(path.join(root, 'public', 'img', 'questions'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(path.join(root, 'content', 'docs', 'chapter', 'meta.json'), '{"title":"Chapter"}\n');
  await writeFile(path.join(root, 'content', 'docs', 'chapter', 'local.svg'), '<svg />\n');
  await writeFile(path.join(root, 'public', 'img', 'questions', 'diagram.png'), 'png-bytes');
  await writeFile(
    path.join(root, 'content', 'docs', 'chapter', 'page.mdx'),
    [
      '# Question',
      '',
      '![diagram](/img/questions/diagram.png)',
      '![local](./local.svg)',
      '![remote](https://example.com/remote.png)',
      '',
    ].join('\n'),
  );

  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AI-readable documentation archive', () => {
  it('preserves the source tree and copies only referenced local assets', async () => {
    const projectRoot = await makeFixture();
    const outputRoot = path.join(projectRoot, '..', `${path.basename(projectRoot)}-output`);
    tempRoots.push(outputRoot);

    const manifest = await packageAiDocs({ projectRoot, outputRoot });

    expect(manifest.documentCount).toBe(1);
    expect(manifest.sourceTreeFileCount).toBe(3);
    expect(manifest.referencedAssets).toEqual(['public/img/questions/diagram.png']);
    expect(manifest.missingAssets).toEqual([]);

    await expect(
      readFile(path.join(outputRoot, 'content', 'docs', 'chapter', 'page.mdx'), 'utf8'),
    ).resolves.toContain('![diagram](/img/questions/diagram.png)');
    await expect(
      readFile(path.join(outputRoot, 'content', 'docs', 'chapter', 'local.svg'), 'utf8'),
    ).resolves.toBe('<svg />\n');
    await expect(
      readFile(path.join(outputRoot, 'public', 'img', 'questions', 'diagram.png'), 'utf8'),
    ).resolves.toBe('png-bytes');

    const manifestFile = JSON.parse(
      await readFile(path.join(outputRoot, '_manifest.json'), 'utf8'),
    );
    expect(manifestFile.documentRoot).toBe('content/docs');
    expect(manifestFile.referencedAssetCount).toBe(1);
  });

  it('fails instead of producing an incomplete archive when a local asset is missing', async () => {
    const projectRoot = await makeFixture();
    const outputRoot = path.join(projectRoot, '..', `${path.basename(projectRoot)}-missing-output`);
    tempRoots.push(outputRoot);

    await writeFile(
      path.join(projectRoot, 'content', 'docs', 'chapter', 'page.mdx'),
      '![missing](/img/questions/missing.png)\n',
    );

    await expect(packageAiDocs({ projectRoot, outputRoot })).rejects.toThrow(
      'missing local asset reference',
    );
  });
});

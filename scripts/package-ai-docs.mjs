import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx']);
const BUNDLED_ASSET_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.csv',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.json',
  '.mp3',
  '.mp4',
  '.ogg',
  '.pdf',
  '.png',
  '.svg',
  '.txt',
  '.wav',
  '.webm',
  '.webp',
  '.xml',
  '.yaml',
  '.yml',
  '.zip',
]);

async function walkFiles(root) {
  const files = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  await visit(root);
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function withoutCodeBlocks(source) {
  return source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '');
}

function extractReferences(source) {
  const text = withoutCodeBlocks(source);
  const references = new Set();
  const patterns = [
    /!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g,
    /^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm,
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/g,
    /\b(?:src|href)\s*=\s*\{\s*["']([^"']+)["']\s*\}/g,
    /\b(?:import|export)\b[^'"\n]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\burl\(\s*["']?([^"')]+)["']?\s*\)/g,
    /["']([^"']+\.(?:avif|bmp|csv|gif|ico|jpe?g|json|mp3|mp4|ogg|pdf|png|svg|txt|wav|webm|webp|xml|ya?ml|zip)(?:[?#][^"']*)?)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) references.add(match[1].trim());
    }
  }

  return [...references];
}

function cleanReference(rawReference) {
  let reference = rawReference.trim();
  if (!reference) return null;

  if (
    reference.startsWith('#') ||
    reference.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    return null;
  }

  reference = reference.split('#', 1)[0].split('?', 1)[0];
  if (!reference) return null;

  try {
    reference = decodeURIComponent(reference);
  } catch {
    // Keep the original spelling when a path contains a literal percent sign.
  }

  return reference.replaceAll('\\', '/');
}

function resolveRepositoryReference(projectRoot, sourceFile, rawReference) {
  const reference = cleanReference(rawReference);
  if (!reference) return null;

  let absolute;
  if (reference.startsWith('@/')) {
    absolute = path.resolve(projectRoot, reference.slice(2));
  } else if (reference.startsWith('/')) {
    absolute = path.resolve(projectRoot, 'public', reference.slice(1));
  } else {
    absolute = path.resolve(path.dirname(sourceFile), reference);
  }

  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  return {
    absolute,
    relative: relative.split(path.sep).join('/'),
    reference,
  };
}

async function isRegularFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function isAssetReference(reference) {
  return BUNDLED_ASSET_EXTENSIONS.has(path.extname(reference).toLowerCase());
}

export async function packageAiDocs({ projectRoot = process.cwd(), outputRoot }) {
  if (!outputRoot) throw new Error('outputRoot is required.');

  const root = path.resolve(projectRoot);
  const destination = path.resolve(outputRoot);
  const docsRoot = path.join(root, 'content', 'docs');

  if (!(await isRegularFile(path.join(root, 'package.json')))) {
    throw new Error(`Not an exam-docs checkout: ${root}`);
  }

  const docsRootStat = await stat(docsRoot).catch(() => null);
  if (!docsRootStat?.isDirectory()) {
    throw new Error(`Documentation source directory is missing: ${docsRoot}`);
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(docsRoot, path.join(destination, 'content', 'docs'), {
    recursive: true,
    preserveTimestamps: true,
  });

  const allDocTreeFiles = await walkFiles(docsRoot);
  const documentFiles = allDocTreeFiles.filter((file) =>
    DOCUMENT_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );

  const bundledAssets = new Set();
  const missingAssets = [];

  for (const documentFile of documentFiles) {
    const source = await readFile(documentFile, 'utf8');
    for (const rawReference of extractReferences(source)) {
      const resolved = resolveRepositoryReference(root, documentFile, rawReference);
      if (!resolved) continue;

      if (!(await isRegularFile(resolved.absolute))) {
        if (isAssetReference(resolved.reference)) {
          missingAssets.push({
            document: path.relative(root, documentFile).split(path.sep).join('/'),
            reference: rawReference,
            expectedPath: resolved.relative,
          });
        }
        continue;
      }

      if (resolved.relative.startsWith('content/docs/')) continue;

      const assetDestination = path.join(destination, ...resolved.relative.split('/'));
      await mkdir(path.dirname(assetDestination), { recursive: true });
      await cp(resolved.absolute, assetDestination, { preserveTimestamps: true });
      bundledAssets.add(resolved.relative);
    }
  }

  const repositoryDocuments = documentFiles.map((file) =>
    path.relative(root, file).split(path.sep).join('/'),
  );
  const sourceTreeFiles = allDocTreeFiles.map((file) =>
    path.relative(root, file).split(path.sep).join('/'),
  );

  const manifest = {
    formatVersion: 1,
    sourceCommit: process.env.GITHUB_SHA || null,
    generatedAt: new Date().toISOString(),
    documentRoot: 'content/docs',
    documentCount: repositoryDocuments.length,
    sourceTreeFileCount: sourceTreeFiles.length,
    referencedAssetCount: bundledAssets.size,
    documents: repositoryDocuments,
    sourceTreeFiles,
    referencedAssets: [...bundledAssets].sort((left, right) => left.localeCompare(right, 'en')),
    missingAssets,
  };

  await writeFile(
    path.join(destination, '_manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  await writeFile(
    path.join(destination, '_AI_README.md'),
    `# exam-docs AI source archive\n\n` +
      `This archive contains the original documentation source tree from \`content/docs/\` without rewriting the Markdown/MDX files.\n\n` +
      `Local files referenced by the documents are copied with their repository paths preserved. For example, a document reference such as \`/img/questions/example.png\` is stored at \`public/img/questions/example.png\`.\n\n` +
      `Use \`_manifest.json\` to enumerate documents and referenced assets. The archive was generated from commit \`${process.env.GITHUB_SHA || 'local'}\`.\n`,
    'utf8',
  );

  if (missingAssets.length > 0) {
    const preview = missingAssets
      .slice(0, 20)
      .map((item) => `${item.document}: ${item.reference} -> ${item.expectedPath}`)
      .join('\n');
    throw new Error(
      `Found ${missingAssets.length} missing local asset reference(s).\n${preview}`,
    );
  }

  return manifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), '.artifacts', 'ai-docs');
  const projectRoot = process.argv[3]
    ? path.resolve(process.argv[3])
    : process.cwd();

  const manifest = await packageAiDocs({ projectRoot, outputRoot });
  console.log(
    `Packaged ${manifest.documentCount} documents, ${manifest.sourceTreeFileCount} source-tree files, and ${manifest.referencedAssetCount} referenced assets into ${outputRoot}`,
  );
}

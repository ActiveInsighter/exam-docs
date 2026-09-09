import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Browser-facing Next asset references originate from exported HTML/RSC payloads
// and from CSS (for fonts/media). Scanning generated JavaScript would also match
// runtime constants such as `/_next/static/immutable`, which are not asset URLs.
const TEXT_EXTENSIONS = new Set(['.html', '.txt', '.css']);
// Next-generated asset names are ASCII and never require quote/parenthesis delimiters.
// Excluding those delimiters prevents CSS url(...) closing punctuation from being
// mistaken for part of the asset path.
const STATIC_REFERENCE_RE = /\/_next\/static\/[A-Za-z0-9._~!$&*+,;=:@%\/-]+/g;

async function collectFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, fullPath, output);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function normalizeReference(reference) {
  return reference.replace(/[?#].*$/, '');
}

export async function findMissingStaticAssetReferences(rootDir) {
  const root = path.resolve(rootDir);
  const files = await collectFiles(root);
  const references = new Map();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const rawReference of text.match(STATIC_REFERENCE_RE) ?? []) {
      const reference = normalizeReference(rawReference);
      const sources = references.get(reference) ?? new Set();
      sources.add(path.relative(root, file));
      references.set(reference, sources);
    }
  }

  const missing = [];
  for (const [reference, sources] of references) {
    const target = path.join(root, reference.slice(1));
    try {
      await readFile(target);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missing.push({ reference, sources: [...sources].sort() });
    }
  }

  return {
    scannedFiles: files.length,
    uniqueReferences: references.size,
    missing: missing.sort((a, b) => a.reference.localeCompare(b.reference)),
  };
}

async function main() {
  const root = process.argv[2] ?? '.static-docs';
  const result = await findMissingStaticAssetReferences(root);
  console.log(
    `[static-assets] Scanned ${result.scannedFiles} browser-facing text files; ` +
      `${result.uniqueReferences} unique /_next/static references.`,
  );

  if (result.missing.length > 0) {
    for (const item of result.missing.slice(0, 50)) {
      console.error(
        `[static-assets] Missing ${item.reference}; referenced by ${item.sources.slice(0, 5).join(', ')}`,
      );
    }
    throw new Error(`${result.missing.length} static asset reference(s) are missing.`);
  }

  console.log('[static-assets] Every browser-facing /_next/static reference exists.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

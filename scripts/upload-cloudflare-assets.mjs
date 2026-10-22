#!/usr/bin/env node
/**
 * Pre-upload a static asset directory to a Worker's Static Assets store.
 *
 * Each CI shard calls this for its own finished files while the other shards
 * are still building, so the upload runs on many runners in parallel instead
 * of on the single deploy runner (wrangler uploads with a fixed concurrency of
 * three). The later `wrangler deploy` then only uploads what is still missing.
 *
 * It speaks the documented direct-upload protocol
 * (https://developers.cloudflare.com/workers/static-assets/direct-upload/) and
 * reproduces wrangler's asset hash and Content-Type exactly: the store is
 * content addressed and keeps the Content-Type sent with the first upload, so
 * a mismatch would either waste the upload or change response headers. Nothing
 * is deployed here; a failure only means wrangler uploads those files itself.
 *
 * Usage: node scripts/upload-cloudflare-assets.mjs <dir> --worker <name> [--concurrency 4]
 * Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import blake3 from 'blake3-wasm';
import mime from 'mime';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
const IGNORED_FILES = new Set(['.assetsignore', '_headers', '_redirects', '_worker.js']);

/** Same as wrangler's hashFile: BLAKE3 of the base64 body plus the extension, 32 hex chars. */
export function hashAsset(contents, filePath) {
  const extension = path.extname(filePath).slice(1);
  return blake3.hash(contents.toString('base64') + extension).toString('hex').slice(0, 32);
}

/** Same as wrangler's getContentType (mime 4 standard + other types). */
export function getAssetContentType(filePath) {
  const contentType = mime.getType(filePath);
  if (contentType && contentType.startsWith('text/') && !contentType.includes('charset')) {
    return `${contentType}; charset=utf-8`;
  }
  return contentType;
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function buildAssetManifest(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !IGNORED_FILES.has(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();

  const manifest = {};
  const filesByHash = new Map();
  await mapLimit(files, 16, async (absolutePath) => {
    const { size } = await stat(absolutePath);
    if (size > MAX_ASSET_SIZE) return;
    const relativePath = `/${path.relative(directory, absolutePath).split(path.sep).join('/')}`;
    const hash = hashAsset(await readFile(absolutePath), absolutePath);
    manifest[relativePath] = { hash, size };
    filesByHash.set(hash, { absolutePath, size });
  });
  return { manifest, filesByHash };
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  } catch {
    return {};
  }
}

async function callApi(url, init, attempt = 1) {
  let response;
  try {
    response = await fetch(url, init);
    if (response.ok) return (await response.json()).result;
    if (response.status < 500 && response.status !== 429) {
      throw Object.assign(new Error(`${response.status} ${await response.text()}`), { fatal: true });
    }
  } catch (error) {
    if (error.fatal || attempt >= MAX_ATTEMPTS) throw error;
  }
  if (attempt >= MAX_ATTEMPTS) {
    throw new Error(`${init.method} ${url} failed with ${response?.status} after ${attempt} attempts.`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
  return callApi(url, init, attempt + 1);
}

export async function uploadAssets({ directory, worker, accountId, apiToken, concurrency = 4, log = console.log }) {
  const started = Date.now();
  const { manifest, filesByHash } = await buildAssetManifest(directory);
  const fileCount = Object.keys(manifest).length;
  const hashed = Date.now();

  const session = await callApi(
    `${API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(worker)}/assets-upload-session`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest }),
    },
  );
  const buckets = session.buckets ?? [];
  const pending = buckets.flat();
  const stats = { fileCount, uploadedFiles: 0, uploadedBytes: 0, hashSeconds: (hashed - started) / 1000 };

  if (pending.length > 0) {
    // Mirror wrangler: some accounts are switched to one-request-per-file uploads.
    const claims = decodeJwtPayload(session.jwt);
    const single = claims.wrangler_single_asset_uploads === true;
    const requests = single ? pending.map((hash) => [hash]) : buckets;
    const limit = single ? Math.max(1, Number(claims.edge_kv_upload_concurrency) || 50) : concurrency;

    await mapLimit(requests, limit, async (bucket) => {
      const files = bucket.map((hash) => {
        const file = filesByHash.get(hash);
        if (!file) throw new Error(`Cloudflare requested unknown asset hash ${hash}.`);
        return { hash, ...file, contentType: getAssetContentType(file.absolutePath) };
      });

      if (single) {
        const [file] = files;
        await callApi(`${API_BASE}/accounts/${accountId}/workers/assets/upload/${file.hash}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.jwt}`,
            'Content-Type': file.contentType ?? 'application/null',
          },
          body: await readFile(file.absolutePath),
        });
      } else {
        const form = new FormData();
        for (const file of files) {
          const body = (await readFile(file.absolutePath)).toString('base64');
          form.append(file.hash, new File([body], file.hash, { type: file.contentType ?? 'application/null' }), file.hash);
        }
        await callApi(`${API_BASE}/accounts/${accountId}/workers/assets/upload?base64=true`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.jwt}` },
          body: form,
        });
      }

      stats.uploadedFiles += files.length;
      stats.uploadedBytes += files.reduce((sum, file) => sum + file.size, 0);
    });
  }

  stats.totalSeconds = (Date.now() - started) / 1000;
  log(
    `[cloudflare-upload] ${worker}: ${fileCount} files hashed in ${stats.hashSeconds.toFixed(1)}s; ` +
      `uploaded ${stats.uploadedFiles} new files (${(stats.uploadedBytes / 1024 / 1024).toFixed(1)} MiB) ` +
      `in ${buckets.length} buckets; total ${stats.totalSeconds.toFixed(1)}s.`,
  );
  return stats;
}

function parseArgs(argv) {
  const options = { concurrency: 4 };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--worker') options.worker = argv[++index];
    else if (value === '--concurrency') options.concurrency = Number(argv[++index]);
    else positional.push(value);
  }
  options.directory = positional[0];
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { directory, worker, concurrency } = parseArgs(process.argv.slice(2));
  const { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId } = process.env;
  if (!directory || !worker || !apiToken || !accountId || !(concurrency > 0)) {
    console.error(
      'Usage: node scripts/upload-cloudflare-assets.mjs <dir> --worker <name> [--concurrency 4]\n' +
        'Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.',
    );
    process.exit(2);
  }
  await uploadAssets({ directory: path.resolve(directory), worker, accountId, apiToken, concurrency });
}

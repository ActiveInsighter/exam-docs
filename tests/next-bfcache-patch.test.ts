import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BFCACHE_ENTRY_BYTES } from '../scripts/patch-next-bfcache-size.mjs';

/*
 * Next charges back/forward cache entries 100 bytes each, so its 50 MB LRU
 * never evicted a visited question page (scripts/patch-next-bfcache-size.mjs).
 */
describe('Next back/forward cache entry size', () => {
  it('is patched in both builds of the installed client router', () => {
    for (const file of [
      'node_modules/next/dist/esm/client/components/segment-cache/bfcache.js',
      'node_modules/next/dist/client/components/segment-cache/bfcache.js',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain(`size: ${BFCACHE_ENTRY_BYTES},`);
      expect(source, file).not.toContain('size: 100,');
    }
    expect(readFileSync('package.json', 'utf8')).toContain('node scripts/patch-next-bfcache-size.mjs');
  });

  it('fails a static build whose client chunks still carry the unpatched size', () => {
    const verify = (size: string) => {
      const root = mkdtempSync(path.join(tmpdir(), 'bfcache-'));
      mkdirSync(path.join(root, '_next/static/chunks'), { recursive: true });
      writeFileSync(path.join(root, '_next/static/chunks/router.js'),
        `function d(e,t,n,r){let a={rsc:n.rsc,bfcacheId:n.bfcacheId,ref:null,size:${size},navigatedAt:e,staleAt:r}}`);
      try {
        execFileSync(process.execPath, ['scripts/verify-next-bfcache-patch.mjs', root], { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    };
    expect(verify('100')).toBe(false);
    expect(verify(String(BFCACHE_ENTRY_BYTES))).toBe(true);
    expect(readFileSync('package.json', 'utf8')).toContain('node scripts/verify-next-bfcache-patch.mjs');
  });
});

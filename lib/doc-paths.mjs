import { createHash } from 'node:crypto';

const MAX_ROUTE_SLUG_LENGTH = 150;
const SAFE_SOURCE_SEGMENT = /^[A-Za-z0-9._~-]+$/u;
const CALCULUS_MODULE_ROUTE_SEGMENTS = {
  '01-模块一-函数、极限与连续': '第一章-函数、极限与连续',
  '02-模块二-导数与微分': '第二章-导数与微分',
  '03-模块三-微分中值定理': '第三章-微分中值定理',
  '04-模块四-一元函数积分学': '第四章-一元函数积分学',
  '05-模块五-微分方程': '第五章-微分方程',
  '06-模块六-多元函数微分学及其应用': '第六章-多元函数微分学及其应用',
  '07-模块七-无穷级数': '第七章-无穷级数',
  '08-模块八-向量代数与空间解析几何': '第八章-向量代数与空间解析几何',
  '09-模块九-多元函数积分学': '第九章-多元函数积分学',
};

function normalizeSourcePath(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function getSourceSegments(relativePath) {
  const normalized = normalizeSourcePath(relativePath).replace(/\.(md|mdx)$/iu, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.at(-1)?.toLowerCase() === 'index') segments.pop();
  // Keep published calculus URLs stable when chapter folders become modules.
  if (segments.length > 3 && segments.slice(0, 3).join('/') === 'math/past-exams/01-高数分类真题0930') {
    segments[3] = CALCULUS_MODULE_ROUTE_SEGMENTS[segments[3]] ?? segments[3];
  }
  return segments;
}

function compactSegment(segment) {
  const prefix =
    segment.match(/^\d{1,3}/u)?.[0] ??
    segment.match(/^[A-Za-z][A-Za-z0-9]{0,11}/u)?.[0] ??
    's';
  const digest = createHash('sha1').update(segment).digest('hex').slice(0, 8);
  return `${prefix}-${digest}`;
}

/**
 * Generate deterministic, browser-safe route slugs without changing source
 * filenames. Every unsafe or non-ASCII segment is compacted, including the
 * first segment, so Fumadocs PageTree URLs always match browser pathnames.
 */
export function getShortDocSlugs(relativePath) {
  const sourceSegments = getSourceSegments(relativePath);
  const slugs = sourceSegments.map((segment) =>
    SAFE_SOURCE_SEGMENT.test(segment) && segment.length <= 40
      ? segment
      : compactSegment(segment),
  );

  for (
    let index = slugs.length - 1;
    index >= 0 && slugs.join('/').length > MAX_ROUTE_SLUG_LENGTH;
    index -= 1
  ) {
    slugs[index] = compactSegment(sourceSegments[index]);
  }

  return slugs;
}

export function getShortDocSlugPath(relativePath) {
  return getShortDocSlugs(relativePath).join('/');
}

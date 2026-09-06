const STATIC_BUILD_HEAP_MIB = 8192;

const existingOptions = (process.env.NODE_OPTIONS ?? '')
  .replace(/--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/g, '')
  .trim();

process.env.NODE_OPTIONS = [
  existingOptions,
  `--max-old-space-size=${STATIC_BUILD_HEAP_MIB}`,
]
  .filter(Boolean)
  .join(' ');

console.log(
  `[static-docs] Node heap ceiling for static build children: ${STATIC_BUILD_HEAP_MIB} MiB.`,
);

await import('./build-static-docs.mjs');

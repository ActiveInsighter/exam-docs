import type { NextConfig } from 'next';

export function getStaticDocsConfig(): NextConfig;
export function shouldIncludeInStaticDocsProject(relativePath: string): boolean;

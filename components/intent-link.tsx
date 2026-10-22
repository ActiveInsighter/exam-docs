'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useCallback, useRef } from 'react';

type IntentLinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  href?: string;
  prefetch?: boolean | null;
};

/*
 * Next.js prefetches the full payload of every static route whose link scrolls
 * into view. A question page's payload is several megabytes (pre-rendered
 * KaTeX plus solutions), and the sidebar, breadcrumbs and page footer show
 * many of them at once: on a phone one page load parsed about 18 MB of
 * prefetched sibling chapters in the background, which mobile browsers can
 * be killed for.
 *
 * This link prefetches only on intent: a mouse hover or the start of a touch,
 * one route at a time, shortly before the click that navigates. An explicit
 * `prefetch` prop still wins.
 */
export function IntentLink({ href = '#', prefetch, onPointerEnter, onPointerDown, onFocus, ...props }: IntentLinkProps) {
  const router = useRouter();
  const warmed = useRef<string | null>(null);
  const warm = useCallback(() => {
    if (warmed.current === href || !href.startsWith('/')) return;
    warmed.current = href;
    router.prefetch(href);
  }, [href, router]);

  return (
    <NextLink
      href={href}
      prefetch={prefetch ?? false}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') warm();
        onPointerEnter?.(event);
      }}
      onPointerDown={(event) => {
        warm();
        onPointerDown?.(event);
      }}
      onFocus={(event) => {
        warm();
        onFocus?.(event);
      }}
      {...props}
    />
  );
}

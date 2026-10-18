'use client';

import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  useFolderDepth,
} from 'fumadocs-ui/components/sidebar/base';
import type { SidebarPageTreeComponents } from 'fumadocs-ui/components/sidebar/page-tree';
import { useTreePath } from 'fumadocs-ui/contexts/tree';
import { usePathname } from 'fumadocs-core/framework';

// Mirrors the default Fumadocs docs-layout folder styles.
const itemClass =
  'relative flex w-full flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0 transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none';
const linkClass =
  'data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary data-[active=true]:hover:transition-colors';
const highlightClass =
  "data-[active=true]:before:content-[''] data-[active=true]:before:bg-fd-primary data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:inset-s-2.5";
const guideClass =
  "before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:inset-s-2.5";

function normalize(url: string) {
  return url.replace(/\/+$/, '') || '/';
}

function FolderBody({ item, children }: Parameters<SidebarPageTreeComponents['Folder']>[0]) {
  const depth = useFolderDepth();
  const pathname = usePathname();
  const style = { paddingInlineStart: `calc(${2 + 3 * (depth - 1)} * var(--spacing))` };
  const active = item.index !== undefined && normalize(pathname) === normalize(item.index.url);

  return (
    <>
      {item.index ? (
        <SidebarFolderLink
          href={item.index.url}
          external={item.index.external}
          active={active}
          className={`${itemClass} ${linkClass}${depth > 1 ? ` ${highlightClass}` : ''}`}
          style={style}
        >
          {item.icon}
          {item.name}
        </SidebarFolderLink>
      ) : (
        <SidebarFolderTrigger className={itemClass} style={style}>
          {item.icon}
          {item.name}
        </SidebarFolderTrigger>
      )}
      {/* Keep collapsed links in the static HTML (hidden="until-found") so
          crawlers and AI browsers can discover every page from any page. */}
      <SidebarFolderContent
        hiddenUntilFound
        className={`relative flex flex-col gap-0.5 pt-0.5${depth === 1 ? ` ${guideClass}` : ''}`}
      >
        {children}
      </SidebarFolderContent>
    </>
  );
}

export const CrawlableSidebarFolder: SidebarPageTreeComponents['Folder'] = ({ item, children }) => {
  const path = useTreePath();

  return (
    <SidebarFolder
      collapsible={item.collapsible}
      active={path.includes(item)}
      defaultOpen={item.defaultOpen}
    >
      <FolderBody item={item}>{children}</FolderBody>
    </SidebarFolder>
  );
};

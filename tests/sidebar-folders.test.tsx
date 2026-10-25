import { FrameworkProvider } from 'fumadocs-core/framework';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarFolder, SidebarFolderTrigger, SidebarProvider } from 'fumadocs-ui/components/sidebar/base';
import { describe, expect, it } from 'vitest';

function folder(active: boolean, defaultOpen?: boolean, collapsible = true) {
  return renderToStaticMarkup(
    <FrameworkProvider usePathname={() => '/docs/math/chapter'} useParams={() => ({})} useRouter={() => ({ push() {}, refresh() {} })}>
    <SidebarProvider defaultOpenLevel={0}>
      <SidebarFolder active={active} defaultOpen={defaultOpen} collapsible={collapsible}>
        <SidebarFolderTrigger>章节</SidebarFolderTrigger>
      </SidebarFolder>
    </SidebarProvider>
    </FrameworkProvider>,
  );
}

describe('sidebar folder defaults', () => {
  it('keeps active ancestors collapsed when explicitly requested', () => {
    expect(folder(true, false)).toContain('aria-expanded="false"');
    expect(folder(false, false)).toContain('aria-expanded="false"');
  });

  it('preserves upstream defaults for folders without an explicit preference', () => {
    expect(folder(true)).toContain('aria-expanded="true"');
    expect(folder(false)).toContain('aria-expanded="false"');
    expect(folder(false, true)).toContain('aria-expanded="true"');
    expect(folder(true, false, false)).toContain('data-open=""');
  });
});

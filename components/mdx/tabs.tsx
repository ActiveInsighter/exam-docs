'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { CodeBlockTabs as OfficialCodeBlockTabs } from 'fumadocs-ui/components/codeblock';
import {
  Tabs as TabsRoot,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsProps as TabsRootProps,
} from 'fumadocs-ui/components/ui/tabs';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type Ref,
  type RefObject,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { useHeightTransition } from './use-height-transition';

/*
 * MDX tabs (styles/doc-tabs.css): `<Tabs>` / `<Tab>` and the code-fence tabs
 * (```lang tab="…"), which compile to `<CodeBlockTabs>`.
 *
 * Both keep the official API and state: they sit on the same Fumadocs
 * primitive, so `groupId`, `persist`, `updateAnchor` and #hash opening behave
 * as before, and `<Tab>` still resolves its value from `items` by position.
 * The look stays official; what is added is the switch, shared by both:
 *
 *   <div data-doc-tabs>                          animates between panel heights
 *     <div data-slot="doc-tabs-content">         observed at its natural height
 *       <div role="tablist" data-slot="doc-tabs-list">
 *         <span data-slot="doc-tabs-indicator" />  Base UI indicator: the gliding underline
 *         <button role="tab" data-slot="doc-tabs-trigger" />
 *       <div role="tabpanel" data-slot="doc-tabs-panel" />   fades in
 *
 * Only the open panel is mounted, as in the official components, and it has
 * no exit animation: Base UI keeps a closing panel mounted until its
 * animations end, which would stack both panels for a moment.
 */

export interface TabsProps extends TabsRootProps {
  /** Simple mode: one trigger per item, matched by `<Tab>` value or order. */
  items?: string[];
  /** Shortcut for `defaultValue` when `items` is provided. @defaultValue 0 */
  defaultIndex?: number;
  /** Extra label at the start of the tab list when `items` is provided. */
  label?: ReactNode;
}

/**
 * Without `items` (the hand-composed form) the children are rendered as
 * given, so the official TabsList / TabsTrigger / TabsContent keep working.
 */
export function Tabs({
  ref,
  items,
  label,
  defaultIndex = 0,
  defaultValue = items ? escapeValue(items[defaultIndex]) : undefined,
  children,
  ...props
}: TabsProps) {
  const frame = useTabsFrame(ref);
  const collection = useMemo<string[]>(() => [], []);
  const context = useMemo(() => ({ items, collection }), [items, collection]);

  return (
    <TabsRoot ref={frame.rootRef} data-doc-tabs="" defaultValue={defaultValue} {...props}>
      <div ref={frame.contentRef} data-slot="doc-tabs-content">
        {items ? (
          <DocTabsList>
            {label ? <span data-slot="doc-tabs-label">{label}</span> : null}
            {items.map((item) => (
              <DocTabsTrigger key={item} value={escapeValue(item)}>
                {item}
              </DocTabsTrigger>
            ))}
          </DocTabsList>
        ) : null}
        <TabsItemsContext value={context}>{children}</TabsItemsContext>
      </div>
    </TabsRoot>
  );
}

export interface TabProps extends Omit<ComponentProps<typeof TabsContent>, 'value'> {
  /** Value of the tab; when omitted, the item at this tab's position. */
  value?: string;
}

export function Tab({ value, ...props }: TabProps) {
  const { items } = useTabsItems();
  const index = useCollectionIndex();
  const resolved = value ?? items?.at(index);
  if (!resolved) {
    throw new Error('Failed to resolve tab `value`, please pass a `value` prop to the Tab component.');
  }

  return <DocTabsPanel value={escapeValue(resolved)} {...props} />;
}

export { TabsContent, TabsList, TabsTrigger };

/*
 * Code-fence tabs. The root stays the official CodeBlockTabs, whose context
 * tells each CodeBlock it sits in a tab; the parts are the shared ones.
 */
export function CodeBlockTabs({ ref, children, ...props }: ComponentProps<typeof OfficialCodeBlockTabs>) {
  const frame = useTabsFrame(ref);

  return (
    <OfficialCodeBlockTabs ref={frame.rootRef} data-doc-tabs="" data-variant="code" {...props}>
      <div ref={frame.contentRef} data-slot="doc-tabs-content">
        {children}
      </div>
    </OfficialCodeBlockTabs>
  );
}

export const CodeBlockTabsList = DocTabsList;
export const CodeBlockTabsTrigger = DocTabsTrigger;
export const CodeBlockTab = DocTabsPanel;

/* ------------------------------------------------------------------------ */

function DocTabsList({ children, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <TabsList data-slot="doc-tabs-list" className="not-prose" {...props}>
      <BaseTabs.Indicator data-slot="doc-tabs-indicator" />
      {children}
    </TabsList>
  );
}

function DocTabsTrigger(props: ComponentProps<typeof TabsTrigger>) {
  return <TabsTrigger data-slot="doc-tabs-trigger" {...props} />;
}

function DocTabsPanel(props: ComponentProps<typeof TabsContent>) {
  return <TabsContent data-slot="doc-tabs-panel" {...props} />;
}

/** The root animates its height; the content inside it is what gets measured. */
function useTabsFrame(ref: Ref<HTMLDivElement> | undefined) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useHeightTransition(rootRef, contentRef, openPanel);

  return {
    contentRef,
    rootRef: useMemo(() => forwardTo(rootRef, ref), [ref]),
  };
}

function openPanel(content: HTMLElement) {
  return content.querySelector(':scope > [role="tabpanel"]:not([hidden])');
}

function forwardTo<T>(own: RefObject<T | null>, external: Ref<T> | undefined) {
  return (element: T | null) => {
    own.current = element;
    if (typeof external === 'function') external(element);
    else if (external) external.current = element;
  };
}

interface TabsItems {
  items?: string[];
  collection: string[];
}

const TabsItemsContext = createContext<TabsItems | null>(null);

function useTabsItems() {
  const context = use(TabsItemsContext);
  if (!context) throw new Error('You must wrap your component in <Tabs>');
  return context;
}

/**
 * The position of this `<Tab>` among its siblings, recorded in render order
 * (the official component's approach; works for pre-rendering and the client).
 */
function useCollectionIndex() {
  const key = useId();
  const { collection } = useTabsItems();

  useEffect(() => {
    return () => {
      const index = collection.indexOf(key);
      if (index !== -1) collection.splice(index, 1);
    };
  }, [key, collection]);

  if (!collection.includes(key)) collection.push(key);
  return collection.indexOf(key);
}

/** The official value escaping, kept identical so stored group values still match. */
function escapeValue(value: string) {
  return value.toLowerCase().replace(/\s/, '-');
}

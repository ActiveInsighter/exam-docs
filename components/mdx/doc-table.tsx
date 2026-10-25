'use client';

import * as React from 'react';
import { CheckIcon, CopyIcon, Maximize2Icon } from 'lucide-react';
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalTag,
  ModalTags,
  ModalTitle,
  ModalToolbar,
} from '@/components/ui/modal';

/*
 * The MDX `table` (styles/doc-table.css).
 *
 *   <figure data-doc-table>
 *     <div data-slot="doc-table-actions">  copy · expand
 *     <div data-slot="doc-table-scroll">   the only horizontal scroller
 *       <table />
 *
 * Cells wrap. Each column gets a floor: its one-line width, capped at a
 * readable measure that follows the column width (--doc-table-col-cap). Short
 * columns therefore never wrap, long ones wrap down to the cap, and only when
 * the floors no longer fit does the table scroll sideways. The one-line width
 * is measured once the table is near the viewport (and again after web fonts
 * load), so hidden tabs and closed accordions cost nothing until shown.
 *
 * Expand opens the same rows on the general Modal (a pushed page when the
 * table already sits inside one); copy writes Markdown as text and a plain
 * HTML table, which spreadsheets and editors paste as real cells.
 */
export function DocTable({ className, ...props }: React.ComponentProps<'table'>) {
  const figureRef = React.useRef<HTMLElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [open, setOpen] = React.useState(false);
  // The modal mounts on first use and then stays, so it can animate closed.
  const [mounted, setMounted] = React.useState(false);
  const [meta, setMeta] = React.useState<TableMeta | null>(null);

  useColumnFloors(tableRef);

  const expand = () => {
    const figure = figureRef.current;
    const table = tableRef.current;
    if (!figure || !table) return;
    setMeta({ title: nearestHeading(figure) ?? '表格', ...tableSize(table) });
    setMounted(true);
    setOpen(true);
  };

  return (
    <figure ref={figureRef} data-doc-table="">
      <div data-slot="doc-table-actions" role="group" aria-label="表格操作">
        <CopyTableButton tableRef={tableRef} />
        <button
          type="button"
          data-slot="doc-table-action"
          title="放大查看"
          aria-label="放大查看表格"
          onClick={expand}
        >
          <Maximize2Icon aria-hidden="true" />
        </button>
      </div>
      <div data-slot="doc-table-scroll" tabIndex={0}>
        <table ref={tableRef} className={className} {...props} />
      </div>
      {mounted ? (
        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent size="xl" data-doc-table-modal="">
            <ExpandedTable meta={meta} {...props} className={className} />
          </ModalContent>
        </Modal>
      ) : null}
    </figure>
  );
}

type TableMeta = { title: string; rows: number; columns: number };

function ExpandedTable({
  meta,
  ...props
}: React.ComponentProps<'table'> & { meta: TableMeta | null }) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  useColumnFloors(tableRef);

  return (
    <>
      <ModalHeader>
        <ModalTitle>{meta?.title ?? '表格'}</ModalTitle>
        {meta ? (
          <ModalTags>
            <ModalTag>{meta.rows} 行</ModalTag>
            <ModalTag>{meta.columns} 列</ModalTag>
          </ModalTags>
        ) : null}
        <ModalToolbar aria-label="表格操作">
          <CopyTableButton tableRef={tableRef} />
        </ModalToolbar>
      </ModalHeader>
      <ModalBody>
        <div data-slot="doc-table-sheet">
          <div data-slot="doc-table-scroll" tabIndex={0}>
            <table ref={tableRef} {...props} />
          </div>
        </div>
      </ModalBody>
    </>
  );
}

function CopyTableButton({ tableRef }: { tableRef: React.RefObject<HTMLTableElement | null> }) {
  const [checked, onClick] = useCopyButton(async () => {
    const table = tableRef.current;
    if (table) await copyTable(table);
  });
  return (
    <button
      type="button"
      data-slot="doc-table-action"
      data-checked={checked ? '' : undefined}
      title={checked ? '已复制' : '复制表格'}
      aria-label={checked ? '已复制' : '复制表格'}
      onClick={onClick}
    >
      {checked ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Column floors                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Writes each column's one-line width to --doc-col-fit on its header cell;
 * the stylesheet turns it into a min-width capped by --doc-table-col-cap.
 */
function useColumnFloors(tableRef: React.RefObject<HTMLTableElement | null>) {
  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    let measured = false;
    let cancelled = false;

    const measure = () => {
      const row = table.rows[0];
      if (!row) return;
      table.setAttribute('data-measuring', '');
      const widths = Array.from(row.cells, (cell) => cell.getBoundingClientRect().width);
      table.removeAttribute('data-measuring');
      // Hidden (a closed tab or accordion): try again once it is shown.
      if (widths.every((width) => width === 0)) return;
      Array.from(row.cells).forEach((cell, index) => {
        cell.style.setProperty('--doc-col-fit', `${Math.ceil(widths[index])}px`);
      });
      measured = true;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        measure();
        if (measured) observer.disconnect();
      },
      { rootMargin: '50% 0px' },
    );
    observer.observe(table);
    document.fonts?.ready.then(() => {
      if (!cancelled && measured) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [tableRef]);
}

/* ------------------------------------------------------------------------ */
/* Modal title and size                                                      */
/* ------------------------------------------------------------------------ */

/** The last section heading before the table, in the same document body. */
function nearestHeading(figure: HTMLElement) {
  const root = figure.closest('#docs-body, #blog-body, .docs-prose') ?? document.body;
  let title: string | null = null;
  for (const heading of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING) {
      title = headingText(heading) || title;
    } else break;
  }
  return title;
}

/** Visible heading text, without the anchor button and its screen-reader label. */
function headingText(heading: Element) {
  const clone = heading.cloneNode(true) as Element;
  clone.querySelectorAll('button, svg, .sr-only, [aria-hidden="true"]').forEach((node) => node.remove());
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function tableSize(table: HTMLTableElement) {
  const head = table.tHead?.rows.length ?? 0;
  const columns = Math.max(0, ...Array.from(table.rows, (row) => row.cells.length));
  return { rows: table.rows.length - head, columns };
}

/* ------------------------------------------------------------------------ */
/* Copy                                                                      */
/* ------------------------------------------------------------------------ */

/** A cell as plain text: KaTeX becomes its TeX source, line breaks survive. */
function cellText(cell: HTMLTableCellElement) {
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.katex').forEach((math) => {
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    const display = math.parentElement?.classList.contains('katex-display');
    math.replaceWith(tex ? (display ? `$$${tex}$$` : `$${tex}$`) : (math.textContent ?? ''));
  });
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent ?? '').replace(/[ \t]+/g, ' ').trim();
}

function tableRows(table: HTMLTableElement) {
  return Array.from(table.rows, (row) => Array.from(row.cells, cellText));
}

function toMarkdown(rows: string[][], headRows: number) {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const line = (row: string[]) =>
    `| ${Array.from({ length: columns }, (_, i) =>
      (row[i] ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>'),
    ).join(' | ')} |`;
  const head = rows.slice(0, Math.max(headRows, 1));
  const body = rows.slice(head.length);
  return [
    ...head.map(line),
    `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function toHtml(rows: string[][], headRows: number) {
  const row = (cells: string[], tag: 'th' | 'td') =>
    `<tr>${cells.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
  const head = rows.slice(0, headRows).map((cells) => row(cells, 'th')).join('');
  const body = rows.slice(headRows).map((cells) => row(cells, 'td')).join('');
  return `<table>${head ? `<thead>${head}</thead>` : ''}<tbody>${body}</tbody></table>`;
}

async function copyTable(table: HTMLTableElement) {
  const rows = tableRows(table);
  const headRows = table.tHead?.rows.length ?? 0;
  const markdown = toMarkdown(rows, headRows);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([toHtml(rows, headRows)], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      // Some browsers refuse rich items; plain text still works.
    }
  }
  await navigator.clipboard.writeText(markdown);
}

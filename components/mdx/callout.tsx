import {
  CalloutContainer,
  CalloutDescription,
  CalloutTitle,
  type CalloutContainerProps,
  type CalloutType,
} from 'fumadocs-ui/components/callout';
import type { ReactNode } from 'react';

/*
 * The MDX `Callout` (styles/doc-callout.css).
 *
 * The official component, assembled from its own exported parts with the same
 * props, icons and markup. The only addition is a set of stable hooks, so the
 * stylesheet never has to match the inline `--callout-color` style:
 *
 *   <div data-callout="info | warning | error | success | idea">
 *     <div role="none" />                 accent rail
 *     <svg />                             official icon
 *     <div>
 *       <p data-slot="callout-title" />
 *       <div data-slot="callout-body" />
 *
 * `warn` and `tip` are the official aliases of `warning` and `info`.
 * A server component: it ships no JavaScript.
 */
export interface CalloutProps extends Omit<CalloutContainerProps, 'title' | 'type'> {
  type?: CalloutType | 'tip';
  title?: ReactNode;
}

export function Callout({ type = 'info', title, children, ...props }: CalloutProps) {
  const resolved = resolveType(type);

  return (
    <CalloutContainer type={resolved} data-callout={resolved} {...props}>
      {title ? <CalloutTitle data-slot="callout-title">{title}</CalloutTitle> : null}
      <CalloutDescription data-slot="callout-body">{children}</CalloutDescription>
    </CalloutContainer>
  );
}

/** The aliases the official CalloutContainer accepts. */
function resolveType(type: CalloutType | 'tip'): Exclude<CalloutType, 'warn'> {
  if (type === 'warn') return 'warning';
  if (type === 'tip') return 'info';
  return type;
}

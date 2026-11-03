/*
 * <AlgoFigure>: a full-colour solution diagram (styles/algo-figure.css).
 *
 * Scanned question figures are black ink and go through the monochrome ink
 * filter (styles/question.css). Algorithm diagrams drawn for solutions use
 * colour to carry meaning (pointers, regions, highlighted paths), so they
 * opt out of that filter and ship as two files generated from one source
 * (scripts/diagrams): `<src>.svg` drawn for the light theme and
 * `<src>-dark.svg` for the dark theme. CSS shows the one matching the site
 * theme; both are lazy, so the hidden variant is never fetched.
 *
 *   <AlgoFigure src="/img/.../2009-42-1" w={720} h={300} alt="…" caption="…" />
 *
 * A server component: it ships no JavaScript.
 */
export interface AlgoFigureProps {
  /** Path without extension; `-dark.svg` is the dark-theme sibling. */
  src: string;
  alt: string;
  /** Intrinsic size of the SVG, so the box is reserved before it loads. */
  w: number;
  h: number;
  caption?: string;
}

export function AlgoFigure({ src, alt, w, h, caption }: AlgoFigureProps) {
  return (
    <figure data-algo-figure>
      <div data-slot="algo-figure-frame" style={{ maxWidth: w, ['--algo-figure-w' as string]: `${w}px` }}>
        <img
          data-variant="light"
          src={`${src}.svg`}
          alt={alt}
          width={w}
          height={h}
          loading="lazy"
          decoding="async"
        />
        <img
          data-variant="dark"
          src={`${src}-dark.svg`}
          alt={alt}
          width={w}
          height={h}
          loading="lazy"
          decoding="async"
        />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

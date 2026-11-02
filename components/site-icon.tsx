import Image from 'next/image';

type SiteIconProps = {
  size?: number;
};

/** Shared brand mark for navigation, home and the browser tab. */
export function SiteIcon({ size = 24 }: SiteIconProps) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      unoptimized
      aria-hidden="true"
      className="shrink-0"
    />
  );
}

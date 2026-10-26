import { clsx } from "@/lib/clsx";

/**
 * The Karighar mark.
 *
 * Served as an <img> pointing at the SVG rather than inlined, on purpose.
 * The artwork's materials are built from SVG filters, and filters are
 * referenced by id — inlining it more than once per page (header + sidebar +
 * a form, say) would put duplicate ids in one document and the browser would
 * resolve every reference to whichever came first. An <img> gives each copy
 * its own document, and the file is fetched once and cached.
 *
 * `size` is in CSS pixels and sets both dimensions; the artwork is square.
 */
export function Logo({
  size = 32,
  className,
  rounded = true,
}: {
  size?: number;
  className?: string;
  /** The badge carries its own rounded tile, so this is only a soft clip. */
  rounded?: boolean;
}) {
  return (
    /* A static brand asset at a fixed size. next/image would add a loader
       for no benefit here, and this app is a static export anyway. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/karighar-logo-3d.svg"
      alt=""
      width={size}
      height={size}
      className={clsx("shrink-0", rounded && "rounded-[22%]", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
      draggable={false}
    />
  );
}

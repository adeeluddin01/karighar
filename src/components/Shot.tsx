"use client";

import { Icon, type IconName } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

/**
 * The photo panel on a service card — the web lane's twin of <Shot> in
 * components/kg/parts.tsx, which draws the same thing with the phone
 * lane's sprite.
 *
 * Its own module, and "use client", because the web home (app/desktop.tsx)
 * is a Server Component: `onError` is a function prop, so a server-rendered
 * <img> carrying one is a build error. <Avatar> in ui.tsx has the same
 * latent constraint and only gets away with it because every caller today
 * already happens to be a client component — and ui.tsx itself must stay
 * server-safe, or every web screen's tree turns client.
 *
 * The icon sits underneath and the photo is layered over it, so no photo —
 * or a broken URL — degrades to the glyph rather than to a hole.
 */
export function Shot({
  src,
  icon,
  className,
}: {
  src?: string | null;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        // No `w-full`: in the `flex flex-col` cards the panel already
        // stretches to the card's width, and the sized usages in
        // /admin/catalog set their own. Emitting both would leave the
        // winner to CSS source order, since nothing merges these.
        "relative grid aspect-[4/3] place-items-center overflow-hidden bg-secondary text-accent-foreground",
        className
      )}
    >
      {/* Sized as a FRACTION of the panel, not in px: this same component
          draws a ~220px card panel on /book and a 64px thumbnail in
          /admin/catalog, and Icon's own `lg` is a flat 24px — lost in the
          former, overbearing in the latter.

          The `!` is load-bearing. Icon sets its width and height as an
          INLINE style, which no ordinary class can override, so this has to
          outrank it. Reaching into the child svg rather than adding a size
          to Icon's own scale, because no single px value serves both a card
          and a thumbnail. */}
      {icon && <Icon name={icon} className="h-auto! w-[22%]!" />}
      {src && (
        // alt="" on purpose: the service name renders immediately below.
        // Plain <img>: next/image needs a loader this static export has no
        // optimizer for (`images.unoptimized` is set for the same reason).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

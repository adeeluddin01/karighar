// Server-safe CSS lane split: both trees render, one is hidden per viewport
// (see `.lane-phone` / `.lane-web` in globals.css). First paint is correct
// without JS, so a prerendered page keeps its content for crawlers.
//
// Only for pages where both lanes are cheap — both of them mount. Anything
// that fetches, subscribes or redirects should use <Switch> instead.
export function LaneSplit({ phone, web }: { phone: React.ReactNode; web: React.ReactNode }) {
  return (
    <>
      <div className="lane-web">{web}</div>
      <div className="lane-phone">{phone}</div>
    </>
  );
}

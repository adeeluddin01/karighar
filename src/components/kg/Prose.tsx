import { Screen, Scroll, TopBar } from "@/components/kg/Screen";

/**
 * A long-form text screen (terms, privacy) in the redesign's chrome —
 * section headings on cards so the wall of legal copy stays readable on a
 * phone.
 */
export function ProseScreen({
  title,
  updated,
  back = "/settings",
  children,
}: {
  title: string;
  updated?: string;
  back?: string;
  children: React.ReactNode;
}) {
  return (
    <Screen>
      <TopBar title={title} back={back} />
      <Scroll underTop pad="plain">
        {updated && <small>{updated}</small>}
        {children}
      </Scroll>
    </Screen>
  );
}

/** One titled block of prose. */
export function ProseSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h3 style={{ fontSize: 15, fontWeight: 800 }}>{title}</h3>
      <small style={{ marginTop: 6, lineHeight: 1.55 }}>{children}</small>
    </section>
  );
}

/* ============================================================
   Trades: the round trip between `provider_services` and the chip grid.

   `provider_services` stores SERVICES (one row per service id), but every
   screen that edits trades — the pro's own /pro/services, and the admin
   verification modal — presents CATEGORIES, because "I do electrical work"
   is the unit a tradesperson thinks in. So the mapping goes down on save and
   back up on load, through `services.category_id` both ways.

   Pulled out of the screens into pure functions so the derivation can be
   tested without a browser or a database. It was previously inline in
   /pro/services and written a second time, slightly differently, in
   /pro/onboarding — which is how onboarding ended up only ever ADDING rows.
   ============================================================ */

/** The two fields of a service this module needs. Anything wider also fits. */
export type TradeService = { id: string; category_id: string };

/**
 * Which categories a provider offers, given the service ids they hold.
 *
 * Unknown ids are ignored rather than treated as a category of their own: a
 * `provider_services` row can outlive the service it points at if the catalog
 * is edited, and a stale row must not materialise a phantom chip.
 */
export function categoriesOf(serviceIds: Iterable<string>, services: TradeService[]): string[] {
  const owned = new Set(serviceIds);
  const cats = new Set<string>();
  for (const s of services) {
    if (owned.has(s.id)) cats.add(s.category_id);
  }
  return [...cats];
}

/**
 * Every service id belonging to the chosen categories — what gets written
 * back to `provider_services`.
 */
export function serviceIdsFor(categoryIds: Iterable<string>, services: TradeService[]): string[] {
  const wanted = new Set(categoryIds);
  return services.filter((s) => wanted.has(s.category_id)).map((s) => s.id);
}

/**
 * What to add and what to remove, so a save never rewrites the whole set.
 *
 * The obvious implementation — delete every row, then insert the desired set
 * — is what /pro/services does today, and it is a latent bug: two round trips
 * with no transaction between them, so a dropped connection after the delete
 * strips a provider of every trade and they silently vanish from the open
 * pool. A diff touches only what actually changed.
 */
export function tradesDiff(
  owned: Iterable<string>,
  desired: Iterable<string>
): { toAdd: string[]; toRemove: string[] } {
  const have = new Set(owned);
  const want = new Set(desired);
  return {
    toAdd: [...want].filter((id) => !have.has(id)),
    toRemove: [...have].filter((id) => !want.has(id)),
  };
}

/**
 * True when two id sets differ, order and duplicates disregarded.
 *
 * Lets the caller skip `provider_services` entirely when the selection was
 * never touched — the dominant case, since most edits here are a bio typo or
 * a CNIC correction. `tradesDiff` would already produce two empty lists, but
 * not issuing the round trips at all is cheaper and removes the only
 * non-atomic step from the common path.
 */
export function tradesChanged(before: Iterable<string>, after: Iterable<string>): boolean {
  const a = new Set(before);
  const b = new Set(after);
  if (a.size !== b.size) return true;
  for (const id of a) {
    if (!b.has(id)) return true;
  }
  return false;
}

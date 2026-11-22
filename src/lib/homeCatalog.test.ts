import { describe, expect, it } from "vitest";
import { fallbackHomeCats, homeCatsFromDb, limitHomeCats } from "./homeCatalog";
import type { Service, ServiceCategory } from "./types";

const cat = (over: Partial<ServiceCategory>): ServiceCategory => ({
  id: "c1",
  name: "AC Service & Repair",
  icon: "ac",
  image_url: null,
  sort_order: 1,
  is_active: true,
  ...over,
});

const svc = (over: Partial<Service>): Service => ({
  id: "s1",
  category_id: "c1",
  name: "AC General Service",
  description: "Cleaning & servicing",
  base_price: 1750,
  unit: "unit",
  image_url: null,
  icon: null,
  visit_fee: 500,
  is_active: true,
  ...over,
});

describe("homeCatsFromDb", () => {
  it("uses the category photo when the category row has one", () => {
    const cats = homeCatsFromDb(
      [cat({ image_url: "https://cdn.example/cat.jpg" })],
      [svc({ image_url: "https://cdn.example/svc.jpg" })]
    );
    expect(cats).toHaveLength(1);
    expect(cats[0].imageUrl).toBe("https://cdn.example/cat.jpg");
    expect(cats[0].icon).toBe("snowflake");
  });

  it("falls back to the first service photo when the category has none", () => {
    const cats = homeCatsFromDb(
      [cat({})],
      [svc({ image_url: null }), svc({ id: "s2", image_url: "https://cdn.example/svc.jpg" })]
    );
    expect(cats[0].imageUrl).toBe("https://cdn.example/svc.jpg");
  });

  it("is icon-only (null photo) when neither category nor service has art", () => {
    const cats = homeCatsFromDb([cat({})], [svc({})]);
    expect(cats[0].imageUrl).toBeNull();
    expect(cats[0].icon).toBe("snowflake");
  });

  it("maps an unknown icon slug to the wrench fallback, like /book", () => {
    const cats = homeCatsFromDb([cat({ icon: "not-a-slug" })], [svc({})]);
    expect(cats[0].icon).toBe("wrench");
  });

  it("drops inactive categories, empty categories and inactive services", () => {
    const cats = homeCatsFromDb(
      [
        cat({ id: "c1" }),
        cat({ id: "c2", name: "Hidden", is_active: false }),
        cat({ id: "c3", name: "Empty", icon: "bolt" }),
      ],
      [svc({}), svc({ id: "s9", category_id: "c1", is_active: false })]
    );
    expect(cats.map((c) => c.key)).toEqual(["c1"]);
    expect(cats[0].services).toHaveLength(1);
  });

  it("orders by sort_order and returns [] when nothing is live", () => {
    const cats = homeCatsFromDb(
      [cat({ id: "c2", name: "B", sort_order: 2 }), cat({ id: "c1", name: "A", sort_order: 1 })],
      [svc({ category_id: "c2" }), svc({ id: "s2", category_id: "c1" })]
    );
    expect(cats.map((c) => c.name)).toEqual(["A", "B"]);
    expect(homeCatsFromDb([], [])).toEqual([]);
  });
});

describe("limitHomeCats", () => {
  it("keeps the first three, in sort order", () => {
    const cats = homeCatsFromDb(
      [
        cat({ id: "c3", name: "C", sort_order: 3 }),
        cat({ id: "c1", name: "A", sort_order: 1 }),
        cat({ id: "c5", name: "E", sort_order: 5 }),
        cat({ id: "c2", name: "B", sort_order: 2 }),
        cat({ id: "c4", name: "D", sort_order: 4 }),
      ],
      [
        svc({ category_id: "c3" }),
        svc({ id: "s1", category_id: "c1" }),
        svc({ id: "s5", category_id: "c5" }),
        svc({ id: "s2", category_id: "c2" }),
        svc({ id: "s4", category_id: "c4" }),
      ]
    );
    expect(limitHomeCats(cats).map((c) => c.name)).toEqual(["A", "B", "C"]);
  });

  it("passes through fewer than three unchanged", () => {
    const cats = homeCatsFromDb([cat({})], [svc({})]);
    expect(limitHomeCats(cats)).toHaveLength(1);
  });
});

describe("fallbackHomeCats", () => {
  it("keeps the seeded names and prices, with no photos", () => {
    const cats = fallbackHomeCats();
    expect(cats.length).toBeGreaterThan(0);
    expect(cats[0].name).toBe("AC Service & Repair");
    expect(cats[0].imageUrl).toBeNull();
    expect(cats[0].services[0].basePrice).toBe(1750);
  });
});

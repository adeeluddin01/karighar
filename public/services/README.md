# Service picture library

Drop artwork here and it shows up in the picture picker in **/admin/catalog**,
on both the category editor and the sub-service editor.

## The rule

One file per slot, named after the slot's slug, in WebP:

```
public/services/ac-installation.webp
public/services/leak-repair.webp
public/services/washing-machine-repair.webp
```

The slugs are listed in [`src/lib/stockImages.ts`](../../src/lib/stockImages.ts)
— 118 of them, grouped by trade. A file whose name doesn't match a slug in
that list is ignored; a slug with no file simply doesn't appear in the picker.

Nothing else has to change. The picker probes this folder at runtime, so a
new file is live on the next page load — no rebuild, no manifest to update,
no migration.

## What the pictures should be

They are rendered at **4:3** and cropped with `object-fit: cover`, at roughly
156×117 CSS px on a phone and 220×165 on desktop. So:

- **4:3, around 800×600.** Bigger is wasted; smaller goes soft on a 2× screen.
- **Subject centred, with margin.** The crop takes the middle — anything near
  an edge can be cut on one lane or the other.
- **A light, near-neutral ground.** The card sits on `--card-2`
  (`#eaf0ec` light / `#1f2e28` dark), so a busy or dark background fights the
  card in one theme or the other.
- **No text in the picture.** The name and price are rendered beneath it, and
  baked-in text can't be translated to Urdu.

## Adding a slot

If you need a picture for something not in the list, add an entry to
`STOCK_IMAGES` in `src/lib/stockImages.ts`. Its `icon` must be one of the
slugs in `CATEGORY_ICON_CHOICES` — `stockImages.test.ts` fails otherwise,
which is what stops a slot falling back to an icon neither lane can draw.

## This is not where uploads go

A photo an admin uploads for one particular service goes to the Supabase
`catalog` bucket instead (see `src/lib/serviceImage.ts`), because it is
per-install data. This folder is the shared set that ships with the app.

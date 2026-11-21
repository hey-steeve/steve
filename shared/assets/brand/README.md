# brand

## Role

`shared/assets/brand/` is the source of the icons and the share image. An app copies these files or serves them.

## Does

- `apple-touch-icon.png` is 180 by 180 pixels. It is an opaque icon for the Apple home screen.
- `favicon-16.png` is 16 by 16 pixels. It is a PNG favicon, with transparency.
- `favicon-32.png` is 32 by 32 pixels. It is a PNG favicon, with transparency.
- `favicon.ico` holds four images, 16, 32, 48, and 64 pixels on a side. `sips` reports 64 by 64 pixels.
- `icon-1024.png` is 1024 by 1024 pixels. It is an opaque icon. `site.webmanifest` does not list it.
- `icon-192.png` is 192 by 192 pixels. It is an opaque icon listed by `site.webmanifest`.
- `icon-512.png` is 512 by 512 pixels. It is an opaque icon listed by `site.webmanifest`.
- `icon-maskable-512.png` is 512 by 512 pixels. It is an opaque maskable icon listed by `site.webmanifest`.
- `og-image.png` is 1200 by 630 pixels. It is an opaque share image. The word Steve is on the left. Steve waves on the right.
- `site.webmanifest` is the manifest. It has no pixel size.

`apple-touch-icon.png` has no alpha channel. Every pixel in it is opaque. `icon-192.png`, `icon-512.png`, `icon-1024.png`, and `icon-maskable-512.png` have an alpha channel. Every pixel in them is opaque.

No app serves these files yet.

## Does not

- No export in `@steve/shared`.
- No wiring in `app/`.
- No edits to the files in this folder.

## Rules

These files are the source. Do not edit them in place.

`site.webmanifest` lists `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/icon-maskable-512.png`. To serve this manifest, put the files under `/icons/`, or change these paths. This folder wires nothing into the app.

## Check

`cd shared/assets/brand && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contains the checksums of the approved original.

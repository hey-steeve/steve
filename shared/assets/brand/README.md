# brand

## Role

`shared/assets/brand/` is the source of the icons and the share image. An app copies these files or serves them.

## Does

- `apple-touch-icon.png` is 180 by 180 pixels. It is an opaque icon for the Apple home screen.
- `favicon-16.png` is 16 by 16 pixels. It is a PNG favicon, with transparency.
- `favicon-32.png` is 32 by 32 pixels. It is a PNG favicon, with transparency.
- `favicon.ico` holds four images, 16, 32, 48, and 64 pixels on a side. `sips` reports 64 by 64 pixels.
- `icon-1024.png` is 1024 by 1024 pixels. It is an opaque icon. `site.webmanifest` does not list it.
- `icon-source-eff1fe.png` is 1024 by 1024 pixels. It is an opaque RGB icon on `#eff1fe`. It is the source for the icon `-page` files below.
- `icon-192.png` is 192 by 192 pixels. It is an opaque icon. `site.webmanifest` lists `icon-192-page.png`.
- `icon-512.png` is 512 by 512 pixels. It is an opaque icon. `site.webmanifest` lists `icon-512-page.png`.
- `icon-maskable-512.png` is 512 by 512 pixels. It is an opaque maskable icon. `site.webmanifest` lists `icon-maskable-512-page.png`.
- `og-image.png` is 1200 by 630 pixels. It is an opaque share image. The word Steve is on the left. Steve waves on the right.
- `site.webmanifest` is the manifest. It has no pixel size.

`node tooling/brand-page.mjs` resizes `icon-source-eff1fe.png` with Lanczos into the icon `-page` files. Do not edit the source or those files in place.

- `icon-1024-page.png`, `icon-512-page.png`, and `icon-192-page.png` are `icon-source-eff1fe.png` resized to 1024, 512, and 192 pixels. Each file has an alpha channel. Every pixel is opaque.
- `icon-maskable-512-page.png` is 512 by 512 pixels. The resize is 312 pixels, placed 100 pixels from each edge, on `#eff1fe`.
- `apple-touch-icon-page.png` is 180 by 180 pixels. It has no alpha channel.
- `favicon-16-page.png` is 16 by 16 pixels. `favicon-32-page.png` is 32 by 32 pixels. `favicon-page.ico` holds 16, 32, 48, and 64. The two PNG favicons and each image in `favicon-page.ico` use a rounded rectangle. The radius is 7 pixels on a 32 pixel side, and the same fraction of the side at the other sizes. The corner pixels are transparent.
- `og-image-page.png` is `og-image.png` on `#eff1fe`. `node tooling/rebackground.mjs` writes it. The share image is a different picture from the icon source.

`apple-touch-icon.png` has no alpha channel. Every pixel in it is opaque. `icon-192.png`, `icon-512.png`, `icon-1024.png`, and `icon-maskable-512.png` have an alpha channel. Every pixel in them is opaque.

The app copies every file here except `README.md` and `SHA256SUMS` into `app/public/icons/`. Layout and the manifest use the `-page` names.

## Does not

- No export in `@steve/shared`.
- No import of `app/`.
- No edits to the pixel files in this folder. The icon paths in `site.webmanifest` name the `-page` files.

## Rules

These files are the source. Do not edit them in place.

`site.webmanifest` lists `/icons/icon-192-page.png`, `/icons/icon-512-page.png`, and `/icons/icon-maskable-512-page.png`. To serve this manifest, put the files under `/icons/`, or change these paths. This folder wires nothing into the app.

## Check

`node tooling/brand-page.mjs --check`

`node tooling/rebackground.mjs --check`

`cd shared/assets/brand && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` lists the checksum of every file in this folder except this README.

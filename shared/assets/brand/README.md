# brand

## Rôle

`shared/assets/brand/` est la source des icônes et de l'image de partage. Une app copie ces fichiers ou les sert.

## Fait

- `apple-touch-icon.png` fait 180 pixels sur 180. Icône opaque pour l'écran d'accueil Apple.
- `favicon-16.png` fait 16 pixels sur 16. Favicon PNG, avec transparence.
- `favicon-32.png` fait 32 pixels sur 32. Favicon PNG, avec transparence.
- `favicon.ico` contient quatre images, de 16 pixels, 32 pixels, 48 pixels et 64 pixels de côté. `sips` rapporte 64 pixels sur 64.
- `icon-1024.png` fait 1024 pixels sur 1024. Icône opaque. `site.webmanifest` ne la cite pas.
- `icon-192.png` fait 192 pixels sur 192. Icône opaque citée par `site.webmanifest`.
- `icon-512.png` fait 512 pixels sur 512. Icône opaque citée par `site.webmanifest`.
- `icon-maskable-512.png` fait 512 pixels sur 512. Icône masquable opaque citée par `site.webmanifest`.
- `og-image.png` fait 1200 pixels sur 630. Image de partage opaque. Le mot Steve est à gauche. Steve salue à droite.
- `site.webmanifest` est le manifeste. Il n'a pas de taille en pixels.

`apple-touch-icon.png` n'a pas de canal alpha. Chaque pixel y est opaque. `icon-192.png`, `icon-512.png`, `icon-1024.png` et `icon-maskable-512.png` ont un canal alpha. Chaque pixel y est opaque.

Aucune app ne sert encore ces fichiers.

## Ne fait pas

- Pas d'export dans `@steve/shared`.
- Pas de branchement dans `app/`.
- Pas de retouche des fichiers dans ce dossier.

## Règles à tenir

Ces fichiers sont la source. Ne pas les éditer sur place.

`site.webmanifest` cite `/icons/icon-192.png`, `/icons/icon-512.png` et `/icons/icon-maskable-512.png`. Pour servir ce manifeste, placer les fichiers sous `/icons/`, ou changer ces chemins. Ce dossier ne branche rien dans l'app.

## Vérifier

`cd shared/assets/brand && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contient les sommes de l'original approuvé.

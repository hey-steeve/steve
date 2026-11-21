# mascot

## Rôle

`shared/assets/mascot/` est la source des images de Steve. Une app copie ces fichiers ou les sert.

## Fait

Chaque fichier est un PNG de 1024 pixels sur 1024.

`states/` contient des bustes, tête et épaules, avec transparence. Le nom de chaque fichier suit la pose visuelle. Il ne suit ni l'id du moment ni le `state`.

Le moment `idle` dans `app/src/moments.ts` n'a pas d'image dédiée.

- `listening.png` correspond au moment `listening` et au state `waiting`. Steve a les yeux ouverts.
- `thinking.png` correspond au moment `thinking` et au state `thinking`. La visière montre un anneau.
- `calling.png` correspond au moment `calling` et au state `working`. Steve est au téléphone.
- `done.png` correspond au moment `happy` et au state `done`. Steve est content.
- `urgent.png` correspond au moment `serious` et au state `blocked`. Les yeux sont des points d'exclamation.

Les fichiers de `body/` et de `avatar/` ne correspondent à aucun moment.

`body/` contient le corps entier, avec transparence.

- `hello.png` est la pose de l'état vide. Ce fichier ne correspond à aucun moment. Steve salue de la main.
- `present.png` est la pose de présentation. Steve tend une main.
- `celebrate.png` est la pose de célébration. Steve lève les deux bras.

`avatar/` contient la tête et deux photos de profil.

- `head.png` est la tête seule, avec transparence.
- `pfp-indigo.png` est une photo de profil carrée et opaque, sur fond indigo.
- `pfp-lavender.png` est une photo de profil carrée et opaque, sur fond lavande.

Aucune app n'utilise encore ces PNG. Ces fichiers sont séparés de la définition de la marmotte dans `shared/src/mascot`. Cette définition sera remplacée plus tard.

## Ne fait pas

- Pas d'export dans `@steve/shared`.
- Pas de retouche des PNG dans ce dossier.

## Règles à tenir

Ces fichiers sont la source. Ne pas les éditer sur place. Dériver les copies redimensionnées dans l'app.

## Vérifier

`cd shared/assets/mascot && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contient les sommes de l'original approuvé.

Le format reste un PNG de 1024 pixels sur 1024, avec transparence, sauf `pfp-indigo.png` et `pfp-lavender.png`.

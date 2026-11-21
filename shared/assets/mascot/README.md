# mascot

## Rôle

`shared/assets/mascot/` est la source des images de Steve. Une app copie ces fichiers ou les sert.

## Fait

Les fichiers de `avatar/` et de `states/` sont des PNG de 1024 pixels sur 1024. Dans `body/`, `hello.png`, `present.png` et `celebrate.png` le sont aussi. `lounge-call.png` fait 1024 pixels sur 1024 et n'est pas une pose. Les autres poses de `body/` ont une autre taille, écrite dans la liste. `duo/` contient des JPEG.

`states/` contient des bustes, tête et épaules, avec transparence. Le nom de chaque fichier suit la pose visuelle. `listening`, `thinking` et `calling` reprennent l'id du moment. `thinking` et `done` reprennent le `state`. `urgent` ne reprend ni l'id du moment ni le `state`.

Le moment `idle` dans `app/src/moments.ts` n'a pas d'image dédiée.

- `listening.png` correspond au moment `listening` et au state `waiting`. Steve a les yeux ouverts.
- `thinking.png` correspond au moment `thinking` et au state `thinking`. La visière montre un anneau.
- `calling.png` correspond au moment `calling` et au state `working`. Steve est au téléphone.
- `done.png` correspond au moment `happy` et au state `done`. Steve est content.
- `urgent.png` correspond au moment `serious` et au state `blocked`. Les yeux sont des points d'exclamation.

Les fichiers de `body/`, de `duo/` et de `avatar/` ne correspondent à aucun moment.

`body/` contient le corps entier, avec transparence.

- `hello.png` est la pose de l'état vide. Ce fichier ne correspond à aucun moment. Steve salue de la main.
- `present.png` est la pose de présentation. Steve tend une main.
- `celebrate.png` est la pose de célébration. Steve lève les deux bras.
- `shrug.png` est la pose où Steve hausse les épaules, paumes vers le haut. Le fichier fait 688 pixels sur 857.
- `thumbs-up.png` est la pose où Steve lève le pouce. Le fichier fait 614 pixels sur 873.
- `thinking.png` est la pose où Steve a un doigt sous le museau. Le fichier fait 477 pixels sur 865. Ce n'est pas le buste `states/thinking.png`.
- `phone.png` est la pose où Steve lit un téléphone tenu à deux mains. Le fichier fait 452 pixels sur 865.
- `clipboard.png` est la pose où Steve tient un porte-bloc à cases. Le fichier fait 469 pixels sur 861.
- `sitting.png` est la pose où Steve est assis, les jambes croisées. Le fichier fait 500 pixels sur 849.
- `calling.png` est la pose où Steve tient le téléphone à l'oreille, l'autre main ouverte. Le fichier fait 599 pixels sur 857. Ce n'est pas le buste `states/calling.png`.
- `lounge-call.png` est une illustration carrée de style icône, sur fond lavande `#DAC4E8`. Le fichier fait 1024 pixels sur 1024. Ce n'est pas une pose transparente.

`duo/` contient Steve avec la marmotte Alan. Chaque fichier est un JPEG opaque de 1152 pixels sur 864.

- `fistbump.jpg` est la scène où Steve et la marmotte Alan se tapent le poing.
- `dad-son.jpg` est la scène où Alan pose une patte sur l'épaule de Steve. Steve est à côté d'Alan.

Grok Imagine a généré ces scènes à partir des visuels publics de la mascotte Alan. Spidey a décidé le 21 novembre 2026 de les garder. Aucune app ne les utilise.

`avatar/` contient la tête et deux photos de profil.

- `head.png` est la tête seule, avec transparence.
- `pfp-indigo.png` est une photo de profil carrée et opaque, sur fond indigo.
- `pfp-lavender.png` est une photo de profil carrée et opaque, sur fond lavande.

Aucune app n'utilise encore ces fichiers. Ils sont séparés de la définition de la marmotte dans `shared/src/mascot`. Cette définition sera remplacée plus tard.

## Ne fait pas

- Pas d'export dans `@steve/shared`.
- Pas de retouche des fichiers dans ce dossier.

## Règles à tenir

Ces fichiers sont la source. Ne pas les éditer sur place. Dériver les copies redimensionnées dans l'app.

## Vérifier

`cd shared/assets/mascot && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contient les sommes de l'original approuvé.

`avatar/`, `states/`, `body/hello.png`, `body/present.png` et `body/celebrate.png` restent des PNG de 1024 pixels sur 1024, avec transparence, sauf `pfp-indigo.png` et `pfp-lavender.png`. `body/lounge-call.png` fait 1024 pixels sur 1024 et n'est pas une pose transparente. Les sept nouvelles poses de `body/` sont des PNG transparents d'une autre taille. `duo/dad-son.jpg` et `duo/fistbump.jpg` sont des JPEG opaques de 1152 pixels sur 864.

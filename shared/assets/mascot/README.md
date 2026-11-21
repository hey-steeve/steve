# mascot

## Rôle

`shared/assets/mascot/` est la source des images de Steve. Une app copie ces fichiers ou les sert.

## Fait

Chaque fichier est un PNG de 1024 pixels sur 1024.

`states/` contient des bustes, tête et épaules, avec transparence. Chaque fichier correspond à un moment de `app/src/moments.ts`.

- `listening.png` correspond à l'écoute, moment `listening`. Steve a les yeux ouverts.
- `thinking.png` correspond au triage, moment `thinking`. La visière montre un anneau.
- `calling.png` correspond à l'appel au cabinet, moment `calling`. Steve est au téléphone.
- `done.png` correspond au créneau confirmé. L'id du moment est `happy` et son `state` est `done`. Steve est content.
- `urgent.png` correspond à l'urgence. L'id du moment est `serious` et son `state` est `blocked`. Les yeux sont des points d'exclamation.

Les fichiers de `body/` et de `avatar/` ne correspondent à aucun moment.

`body/` contient le corps entier, avec transparence.

- `hello.png` sert à l'état vide. Steve salue de la main.
- `present.png` est la pose de présentation. Steve tend une main.
- `celebrate.png` est la pose de célébration. Steve lève les deux bras.

`avatar/` contient la tête et deux photos de profil.

- `head.png` est la tête seule, avec transparence.
- `pfp-indigo.png` est une photo de profil carrée et opaque, sur fond indigo.
- `pfp-lavender.png` est une photo de profil carrée et opaque, sur fond lavande.

## Ne fait pas

- Pas d'export dans `@steve/shared`.
- Pas de retouche des PNG dans ce dossier.

## Règles à tenir

Ces fichiers sont la source. Ne pas les éditer sur place. Dériver les copies redimensionnées dans l'app.

## Vérifier

`shasum -a 256 shared/assets/mascot/*/*.png`

Chaque somme reste celle de l'original approuvé. Le format reste un PNG de 1024 pixels sur 1024, avec transparence, sauf `pfp-indigo.png` et `pfp-lavender.png`.

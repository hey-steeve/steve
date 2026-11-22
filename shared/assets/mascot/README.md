# mascot

## Role

`shared/assets/mascot/` is the source of Steve's images. An app copies these files or serves them.

## Does

The files in `avatar/` and in `states/` are 1024 by 1024 pixel PNGs. In `body/`, `hello.png`, `present.png`, and `celebrate.png` are too. `lounge-call.png` is 1024 by 1024 pixels and is not a pose. The other poses in `body/` have another size, written in the list. `duo/` holds JPEGs.

`states/` holds busts of the head and shoulders, with transparency. Each file name follows the visual pose. `listening`, `thinking`, and `calling` reuse the moment id. `thinking` and `done` reuse the `state`. `urgent` reuses neither the moment id nor the `state`.

The `idle` moment in `app/src/moments.ts` has no dedicated image.

- `listening.png` matches the `listening` moment and the `waiting` state. Steve's eyes are open.
- `thinking.png` matches the `thinking` moment and the `thinking` state. The visor shows a ring.
- `calling.png` matches the `calling` moment and the `working` state. Steve is on the phone.
- `done.png` matches the `happy` moment and the `done` state. Steve is happy.
- `urgent.png` matches the `serious` moment and the `blocked` state. The eyes are exclamation marks.

The files in `body/`, in `duo/`, and in `avatar/` match no moment.

`body/` holds the full body, with transparency.

- `hello.png` is the wave pose. This file matches no moment. Steve waves with one hand.
- `present.png` is the presentation pose. Steve holds out one hand.
- `celebrate.png` is the celebration pose. Steve raises both arms.
- `shrug.png` is the pose where Steve shrugs, palms up. The file is 688 by 857 pixels.
- `thumbs-up.png` is the pose where Steve raises a thumb. The file is 614 by 873 pixels.
- `thinking.png` is the pose where Steve has a finger under the snout. The file is 477 by 865 pixels. This is not the bust `states/thinking.png`.
- `phone.png` is the pose where Steve reads a phone held in both hands. The file is 452 by 865 pixels.
- `clipboard.png` is the pose where Steve holds a clipboard with checkboxes. The file is 469 by 861 pixels.
- `sitting.png` is the pose where Steve sits with crossed legs. The file is 500 by 849 pixels.
- `calling.png` is the pose where Steve holds the phone to one ear, with the other hand open. The file is 599 by 857 pixels. This is not the bust `states/calling.png`.
- `bubbles.png` is the home-sheet pose. Steve lies on his belly and blows soap bubbles. The file is 1137 by 840 pixels and includes the contact shadow.
- `lounge-call.png` is a square icon-style illustration, on a lavender background `#DAC4E8`. The file is 1024 by 1024 pixels. This is not a transparent pose.

`duo/` holds Steve with Alan the marmot. Each file is an opaque JPEG of 1152 by 864 pixels.

- `fistbump.jpg` is the scene where Steve and Alan the marmot bump fists.
- `dad-son.jpg` is the scene where Alan puts a paw on Steve's shoulder. Steve is beside Alan.

Grok Imagine generated these scenes from Alan's public mascot visuals. Spidey decided on 2026-11-21 to keep them. No app uses them yet.

`avatar/` holds the head and two profile photos.

- `head.png` is the head alone, with transparency.
- `pfp-indigo.png` is a square opaque profile photo, on an indigo background.
- `pfp-lavender.png` is a square opaque profile photo, on a lavender background.

No app uses these files yet. They are separate from the marmot definition in `shared/src/mascot`. The marmot definition will be replaced later.

## Does not

- No export in `@steve/shared`.
- No edits to the files in this folder.

## Rules

These files are the source. Do not edit them in place. Derive the resized copies in the app.

## Check

`cd shared/assets/mascot && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contains the checksums of the approved original.

`avatar/`, `states/`, `body/hello.png`, `body/present.png`, and `body/celebrate.png` stay 1024 by 1024 pixel PNGs, with transparency, except `pfp-indigo.png` and `pfp-lavender.png`. `body/lounge-call.png` is 1024 by 1024 pixels and is not a transparent pose. The eight poses in `body/` that are another size are transparent PNGs. Only `bubbles.png` is new. `duo/dad-son.jpg` and `duo/fistbump.jpg` are opaque JPEGs of 1152 by 864 pixels.

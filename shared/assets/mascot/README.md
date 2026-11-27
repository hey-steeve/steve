# mascot

## Role

`shared/assets/mascot/` is the source of Steve's images. An app copies these files or serves them.

## Does

The files in `avatar/` and in `states/` are 1024 by 1024 pixel PNGs. In `body/`, `hello.png`, `present.png`, and `celebrate.png` are too. `lounge-call.png` and `lounge-call-source-eff1fe.png` are 1024 by 1024 pixels and are not poses. The other poses in `body/` have another size, written in the list. `duo/` holds JPEGs.

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
- `bubbles-hd.png` is the same pose at a higher resolution, with clean bubble edges. The file is 1459 by 1078 pixels. The app home and the reminders page use it.
- `profile-card.png` is the pose where Steve stands and holds up a lavender profile card. The file is 1254 by 1254 pixels. The profile page uses it.
- `documents.png` is the pose where Steve sits and reads an open lavender folder. The file is 1254 by 1254 pixels. The documents page uses it.
- `mailbox.png` is the pose where Steve slips a letter into a lavender mailbox. The file is 1254 by 1254 pixels. The inbox page uses it.
- `lounge-call.png` is a square icon-style illustration, on a lavender background `#DAC4E8`. The file is 1024 by 1024 pixels. This is not a transparent pose. The corner pixels are transparent.
- `lounge-call-source-eff1fe.png` is 1024 by 1024 pixels. It is an opaque RGB picture on `#eff1fe`. It is the source for `lounge-call-page.png`. The corners are opaque.
- `lounge-call-page.png` is that source at the same size. The corners are opaque. `node tooling/mascot-page.mjs` writes this file from `lounge-call-source-eff1fe.png`. When the page file has another size, the command resizes the source with Lanczos. `lounge-call.png` stays the lavender file.

`duo/` holds Steve with Alan the marmot. Each file is an opaque JPEG of 1152 by 864 pixels.

- `fistbump.jpg` is the scene where Steve and Alan the marmot bump fists.
- `dad-son.jpg` is the scene where Alan puts a paw on Steve's shoulder. Steve is beside Alan.

Grok Imagine generated these scenes from Alan's public mascot visuals. Spidey decided on 2026-11-21 to keep them. No app uses them yet.

`avatar/` holds the head and the profile photos.

- `head.png` is the head alone, with transparency.
- `pfp-indigo.png` is a square opaque profile photo, on an indigo background.
- `pfp-lavender.png` is a square opaque profile photo, on a lavender background.
- `pfp-lavender-profile.png` is that same photo on the profile background `#daddfe`. The header avatar uses this file. `node tooling/rebackground.mjs` writes it from `pfp-lavender.png`.

The app encodes `pfp-lavender-profile.png` as the header avatar. The other files in `avatar/` are unused. They are separate from the marmot definition in `shared/src/mascot`. The marmot definition will be replaced later.

## Does not

- No export in `@steve/shared`.
- No edits to the files in this folder.

## Rules

These files are the source. Do not edit them in place. Derive the resized copies in the app.

## Check

`node tooling/mascot-page.mjs --check`

`cd shared/assets/mascot && shasum -a 256 -c SHA256SUMS`

`SHA256SUMS` contains the checksums of the approved original.

`avatar/`, `states/`, `body/hello.png`, `body/present.png`, and `body/celebrate.png` stay 1024 by 1024 pixel PNGs, with transparency, except `pfp-indigo.png`, `pfp-lavender.png`, and `pfp-lavender-profile.png`. `body/lounge-call.png`, `body/lounge-call-source-eff1fe.png`, and `body/lounge-call-page.png` are 1024 by 1024 pixels and are not transparent poses. The twelve poses in `body/` that are another size are transparent PNGs. `bubbles-hd.png` is the home pose. `pfp-lavender-profile.png` is the flat profile file. `lounge-call-source-eff1fe.png` is the flat page original. `lounge-call-page.png` is that file at the same size. `duo/dad-son.jpg` and `duo/fistbump.jpg` are opaque JPEGs of 1152 by 864 pixels. A `-page` file uses `#eff1fe`. A `-profile` file uses `#daddfe`. Do not edit the unsuffixed file.

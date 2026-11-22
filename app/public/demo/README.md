# Demo user avatar

`user-avatar.webp` is the photo in the home header profile frame. The frame is 32 CSS pixels and uses the sm radius token. The file is 192 by 192, which is 6 times that frame and above the 96 pixel floor for a device pixel ratio of 3.

`demoUserAvatarSrc` in `app/src/chat/demo-user-avatar.ts` names this file. Set that constant to `undefined` to show the profile glyph.

The source stays outside the repo at `~/Developer/git/steve-shots/peter-pp-source-v2.webp`. Do not commit it, and do not copy it into `shared/assets/mascot`. The file is 1920 by 1080 pixels.

The committed crop is left 537, top 354, 520 by 520. The square is centred on the face. The top edge keeps a strip of the red mask. The WebP quality is 80.

Regenerate it from the repo root. This uses the sharp install in `@steve/app`, and the working directory is that package:

```sh
pnpm --filter @steve/app exec node --input-type=module <<'EOF'
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "package.json"));
const sharp = require("sharp");
const destDir = path.join(process.cwd(), "public/demo");
mkdirSync(destDir, { recursive: true });
await sharp(path.join(process.env.HOME, "Developer/git/steve-shots/peter-pp-source-v2.webp"))
  .extract({ left: 537, top: 354, width: 520, height: 520 })
  .resize(192, 192)
  .webp({ quality: 80, alphaQuality: 80 })
  .toFile(path.join(destDir, "user-avatar.webp"));
EOF
```

To swap the person, point the command at another portrait and change the crop until the face sits in the frame. Keep `demoUserAvatarSrc` pointed at `/demo/user-avatar.webp`.

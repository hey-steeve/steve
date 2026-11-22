# Demo user avatar

`user-avatar.webp` is the photo in the home header profile frame. The frame is 32 CSS pixels and uses the sm radius token. The file is 192 by 192, which is 6 times that frame and above the 96 pixel floor for a device pixel ratio of 3.

`demoUserAvatarSrc` in `app/src/chat/demo-user-avatar.ts` names this file. Set that constant to `undefined` to show the profile glyph.

The source stays outside the repo at `~/Developer/git/steve-shots/peter-pp-source.png`. Do not commit it, and do not copy it into `shared/assets/mascot`. The file is 1200 by 1500 pixels.

The face detector box is x 44, y 373, 766 by 766. That box cuts the hair. The committed crop is left 40, top 200, 920 by 920, so the hair and the chin stay inside the frame. The WebP quality is 80.

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
await sharp(path.join(process.env.HOME, "Developer/git/steve-shots/peter-pp-source.png"))
  .extract({ left: 40, top: 200, width: 920, height: 920 })
  .resize(192, 192)
  .webp({ quality: 80, alphaQuality: 80 })
  .toFile(path.join(destDir, "user-avatar.webp"));
EOF
```

To swap the person, point the command at another portrait and change the crop until the face sits in the frame. Keep `demoUserAvatarSrc` pointed at `/demo/user-avatar.webp`.

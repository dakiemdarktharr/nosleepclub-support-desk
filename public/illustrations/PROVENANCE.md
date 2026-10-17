# Support mascot illustration

The original `vng-support-mascot.png` was generated on 2026-09-21 with the built-in imagegen tool under the user's approved mascot direction; the current edited asset is `vng-support-mascot-folder.png` (see the edit record below). Original AI interpretation inspired by NAVI by VNGGames, not an official VNG asset or claim of endorsement. No original mascot artwork was copied into this repository. Local Nunito license remains in src/app/fonts; no Gilroy imported.

Research references:
- VNGGames GameVerse 2026 introduction: https://vng.com.vn/news/press-release/vnggames-gameverse-2026.html
- Original NAVI designer presentation: https://www.behance.net/gallery/254917035/Navi-by-VNGGames
- VNG palette: https://vng.com.vn/guidelines/brand/colour-palettes.html
- Typography: https://vng.com.vn/guidelines/brand/typography.html

NAVI is identified as the VNGGames mascot, not a generic VNG corporate mascot. Palette uses orange #F05A22 with charcoal #202124 text for button contrast. The working screens use white/light neutral surfaces.

Generation prompt:

Create one polished 3D mascot illustration for a Vietnamese employee IT support website, inspired by NAVI by VNGGames: a friendly compact rounded upward-pointing triangular orange character (navigation-arrow silhouette), small square rounded yellow face panel centered on its body, two warm dark expressive eyes and a gentle smile, stubby yellow shoes, rounded short orange arms, one waving hello. Whole body fully visible, upright, slight three-quarter view, balanced proportions. Smooth soft satin orange material (#F05A22), warm yellow face (#FFCC04), tasteful soft studio illumination and subtle grounding shadow. Centered composition with generous whitespace, pure warm off-white background #FAFAF8. No text, no logo, no wordmark, no watermark, no accessory, no extra characters. High-quality approachable professional tech mascot, not a pointer cursor, no angular sharp needle, not flame shaped. Original AI interpretation for a student demo, not an official brand asset. Square output.

## Nguồn giao diện tái sử dụng

Giao diện orange/NAVI, SVG/cursor và các style liên quan được tái sử dụng từ workspace `typescript_maxxing` khi tích hợp Support v3 ở commit `89d62c4`. Font Nunito/Baloo2 cùng license được giữ trong `src/app/fonts/`. Việc tích hợp có AI assistance; commit mới không thay đổi nguồn gốc hay chứng minh human review. Chi tiết quá trình phục hồi giao diện có trong lịch sử Git của `UI-RESTORATION.md`.

## Folder face edit — 2026-10-17

Base: `13edf8034df44decabf41b86da7fe1c89e1a9c33`. AI assistance: Codex and the built-in imagegen tool; no independent human review is implied. The user supplied a NAVI reference showing a folder-shaped face. That reference was used only to guide the face outline, and is not bundled in this repository.

Replaced the rounded rectangular faceplate with a yellow folder silhouette: raised upper-left tab and a rounded step down to the upper-right edge. The edited PNG retains a transparent background, the orange 3D body, friendly expression and waving pose. The homepage and completed-request illustration use the new filename so image caches request the edited asset. The SVG cursor is outside this edit's scope.

Local verification: lint, typecheck, production build, docs links and diff whitespace passed; Vitest reported 1,317 passed and one skipped; 35 script tests passed. The existing mascot transparency, role navigation and completion-flow checks passed in production mode on desktop Chromium (6) and Pixel 7 (6), with homepage screenshots visually inspected. Mongo restart verification was not performed because no isolated test Mongo was configured. Runtime dependency audit reported zero vulnerabilities; the full audit still reported the seven existing high-severity development dependency findings documented in RUNBOOK.md. No dependency changes were made.

Edit prompt (verbatim):

> Use case: precise-object-edit. Asset type: existing transparent 3D mascot PNG for a website. Image 1 is the edit target; Image 2 is reference ONLY for the silhouette of the yellow folder-shaped face. Edit Image 1 ONLY: change the outline of the existing yellow faceplate from a rounded rectangle into a clearly recognizable folder silhouette matching Image 2: raised tab across the upper-left roughly 55% of the face width, then a distinct rounded vertical step down to the lower upper-right horizontal edge. The folder step must be large enough to read clearly at small website sizes. Maintain the faceplate's overall size and position, with the upper-left tab extended upward and the upper-right edge lowered a little to create the folder notch. Keep the current friendly open eyes, brown eyebrows, little smile, blush, orange triangular body, pose, waving hand, feet, yellow boots, material texture, lighting, shadows, camera, composition, transparent canvas and padding unchanged. Integrate the new face outline with the same soft dimensional bevel and orange socket around it. Do not copy the winking expression or text from Image 2. Output the full original mascot, centered on a genuinely transparent background, same square composition. No text, logo, extra objects or other redesign. This is a local face outline change, preserve everything else.

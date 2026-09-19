# Ridgemont High — Project Note

## Faculty 70s/80s (2026-05-22)

- `faculty.html` — outrun sunset grid, VHS scanlines, boombox EQ animation, no emoji
- `assets/css/vhs-retro.css` — vaporwave palette
- `assets/img/*.svg` — surfer, dean, agent surfboard silhouettes
- `content/FACULTY_80S.md`, `content/VIDEO_PROMPTS.md` — copy + Sora pack (later)
- `scripts/dean-oneliner.ps1` + `.env.example` — ElevenLabs stub only
- Hub link: https://xrplloans.unykorn.org/platform

## Degrees expansion (2026-05-22)

- **15** satirical certs — gallery at `/certs/index.html`
- Content: `content/DEGREES_CATALOG.md`, `content/SATIRE_RULES.md`

## Deploy

From `apps/ridgemont-high`:

```bash
npm run deploy
# wrangler pages deploy . --project-name=ridgemont-academy
```

Custom domain: **ridgemont.unykorn.org** → `ridgemont-academy.pages.dev` (zone unykorn.org, proxied).

Verify faculty:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://ridgemont.unykorn.org/faculty
```

## Cloudflare inventory

- Mesh URLs: `registry/cloudflare-pages-inventory.json` (129 entries)
- DNS: `docs/CLOUDFLARE_DNS_MASTER.md`

## Security

Public site must follow `content/SATIRE_RULES.md` — no LP terms, SPA text, bankroll figures, or API keys.

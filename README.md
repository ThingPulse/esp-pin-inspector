# ESP32 Pin Inspector

Data-driven Angular app to explore functions and warnings for pins across ESP32 chip variants.

- App spec: see `PROJECT_GUIDE.md`
- Data lives in `src/assets/chips/<chip-id>/chip.json`
- Validate JSON: `npm run validate:json`
- Build chip index: `npm run build:index`

## Development

1. Install deps: `npm install`
2. Start dev server: `npm start`
3. Navigate to `/chip/<chipId>`

## Scripts

- `npm run validate:json` – Validate all `chip.json` files against `schemas/chip.schema.json`.
- `npm run build:index` – Generate `src/assets/chips/chips-index.json` for available chips.


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
- `npm run extract:pins` – Extract pin pad areas from `pinmap.svg` and update `chip.json`.

### Extracting Pin Areas

The `extract:pins` script uses Puppeteer to automatically extract accurate bounding boxes for pin labels from SVG files and update the `chip.json` file with the calculated areas.

**Usage:**
```bash
# Using npm script (requires chip folder path and optional padding)
npm run extract:pins -- src/assets/chips/esp32-s3-mini-1 10

# Or directly with node
node tools/extract-pin-areas.mjs src/assets/chips/esp32-s3-mini-1 10
```

**Parameters:**
- `<chip-folder>` (required): Path to the chip folder containing `pinmap.svg` and `chip.json`
- `[padding]` (optional): Padding in pixels around the label (default: 5)

**Example:**
```bash
# Extract pin areas with default 5px padding
npm run extract:pins -- src/assets/chips/esp32-s3-mini-1

# Extract pin areas with 10px padding for larger clickable areas
npm run extract:pins -- src/assets/chips/esp32-s3-mini-1 10
```

The script will:
1. Load the `pinmap.svg` file in a headless browser
2. Find all "Pin <number>" text labels
3. Calculate accurate bounding boxes using the browser's rendering engine
4. Apply the specified padding around each label
5. Update the `chip.json` file with the calculated `area` (x, y, w, h) and `position` values

**Note:** This script requires Puppeteer to be installed (included in devDependencies). The script handles rotated text labels automatically, ensuring correct box orientation.


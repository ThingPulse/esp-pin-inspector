# PROJECT_GUIDE.md – ESP32 Pin Inspector (Angular + JSON Assets)

> **Purpose for Gemini**: This document defines the full architecture, schema, and implementation plan for the *ESP32 Pin Inspector* web application. Gemini agents should use this as the authoritative specification when generating code, services, JSON schemas, or UI components. Follow its structure and conventions exactly unless explicitly instructed otherwise.

---

## Overview

You will build an **Angular web application** that answers the question:

> *Which pins are available and what functions are available on those pins for each ESP32 chip variant?*

The app will:

* Display a **graphical footprint** of the selected chip (PNG/JPEG).
* Allow users to **click pins** to view their available functions.
* Show **warnings** for pins with reserved/strap functions.
* Load **chip definitions from JSON files**, one folder per chip.
* Be fully **client-side** and **data-driven**.

Gemini should generate and organize the code as defined below.

---

## 1. High-level goals

* **Data-first** architecture: all chip information is in `assets/chips/<chip-id>/` JSON files.
* **Interactive visual layout**: chip image + SVG overlay for clickable pins.
* **Warnings and safety**: reserved pins highlighted, conflicts shown.
* **Multi-chip support** with easy extension via new folders.
* **Offline capable** static web app.

---

## 2. Repository layout

```
/ (Angular workspace)
├── README.md
├── PROJECT_GUIDE.md          ← this file
├── angular.json
├── package.json
├── src/
│  ├── app/
│  │  ├── core/
│  │  │  ├── services/
│  │  │  │  ├── chip-data.service.ts
│  │  │  │  ├── selection.service.ts
│  │  │  │  ├── image-map.service.ts
│  │  │  │  └── warning.service.ts
│  │  │  └── models/
│  │  ├── features/
│  │  │  ├── chip-picker/
│  │  │  ├── pin-canvas/
│  │  │  ├── pin-details/
│  │  │  ├── function-filter/
│  │  │  └── search-box/
│  │  ├── pages/chip-page/
│  │  ├── shared/
│  │  │  ├── components/
│  │  │  └── pipes/
│  │  └── app.routes.ts
│  └── assets/chips/
│     ├── esp32-wroom-32e/
│     │  ├── chip.json
│     │  ├── pinmap.png
│     ├── esp32-s3-wroom-1/
│     │  ├── chip.json
│     │  └── pinmap.png
│     └── esp32-c3-mini-1/
│        ├── chip.json
│        └── pinmap.png
└── tools/
   ├── validate-json.mjs
   └── build-index.mjs
```

---

## 3. JSON data model (chip definition)

Each chip folder contains:

* **Image:** `pinmap.png`
* **Definition:** `chip.json`

### 3.1 Top-level fields

```json
{
  "chipId": "esp32-wroom-32e",
  "name": "ESP32-WROOM-32E",
  "package": "Module",
  "datasheetUrl": "https://example.com/datasheet.pdf",
  "image": "pinmap.png",
  "viewBox": { "width": 1600, "height": 1200 },
  "pins": [ /* Pin objects */ ]
}
```

### 3.2 Pin object

```json
{
  "id": "GPIO0",
  "number": "GPIO0",
  "name": "GPIO0",
  "position": { "x": 340, "y": 1080 },
  "functions": [ { "kind": "GPIO" }, { "kind": "UART", "role": "CTS0" } ],
  "reserved": {
    "level": "warn",
    "tags": ["strap"],
    "reason": "Boot strap pin; avoid pulling low at reset"
  }
}
```

### 3.3 Key nested types

* **PinFunction:** describes a capability (GPIO, UART, SPI, etc.).
* **Reserved:** defines warnings and boot constraints.

---

## 4. Angular architecture

### Core services

* `ChipDataService`: loads and caches chip JSON.
* `ImageMapService`: handles SVG overlay and pin hit testing.
* `SelectionService`: maintains app state (selected chip/pin/filter).
* `WarningService`: computes conflicts and warning messages.

### Components

* `ChipPickerComponent`: select chip variant.
* `PinCanvasComponent`: renders chip image with clickable pins (SVG overlay).
* `PinDetailsComponent`: sidebar with functions, warnings, and electrical data.
* `FunctionFilterComponent`: filter by capability (GPIO, UART, etc.).
* `SearchBoxComponent`: text search.

---

## 5. Routing

* `/` → Chip picker
* `/chip/:chipId` → Loads chip, displays interactive image
* `?pin=GPIO0` → Deep link to pin

---

## 6. Visualization

* Overlay SVG over PNG/JPEG base image.
* Each pin → clickable hotspot.
* Color coding for functions and warnings.
* Tooltips show top functions + warning level.

---

## 7. Warning logic

* Derived from `reserved` + `conflicts`.
* Severity levels: `info`, `warn`, `error`.
* Tooltip and sidebar messages reflect these.

---

## 8. Data validation

* Schema: `schemas/chip.schema.json`.
* Validator script: `tools/validate-json.mjs` using AJV.
* Build script: `tools/build-index.mjs` creates `chips-index.json`.

---

## 9. Development workflow

1. Create new chip folder → add `chip.json` + `pinmap.png`.
2. Run validation script → ensures correct schema.
3. Build index.
4. Start app → navigate to `/chip/<chipId>`.

---

## 10. Tasks for Gemini agents

### Agent A – Scaffold & Core

* Create Angular app with strict TS.
* Implement routing and services per above.

### Agent B – SVG Overlay

* Implement PinCanvas with SVG overlay and hit testing.

### Agent C – Data & Validation

* Author schema and validation scripts.

### Agent D – Filters & Warnings

* Build filtering UI and warning rule engine.

### Agent E – Polish & E2E

* Add keyboard nav, tooltips, export, and tests.

---

## 11. MVP Acceptance Criteria

* App loads chip JSON and renders image + SVG overlay.
* Clicking a pin shows functions and warnings.
* Reserved pins show colored warnings.
* Deep-linking via query param works.
* JSON validation passes.

---

## 12. Future Enhancements

* CSV → JSON generator.
* Dark mode, density controls.
* Pin comparison drawer.
* PSRAM/flash conflict toggles.

---

**End of PROJECT_GUIDE.md**

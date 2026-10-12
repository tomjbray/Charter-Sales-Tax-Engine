# Charter Sales Tax Engine

Application version: **0.1.0-phase0**

## Purpose

The application evaluates a multi-sector charter itinerary against configured sales-tax rules. It derives transaction facts, selects one deterministic rule per sector, allocates charter value by sector distance and produces an on-screen and print-friendly trace.

## Runtime files

The current application loads:

- `airports.json`
- `countries.json`
- `input_requirements.json`
- `selling_entities.json`
- `tax_territories.json`
- `vat_rules.json`

`aircraft_types.json` is no longer a runtime dependency.

## Rule matching conventions

- Blank rule values and `ANY` are wildcards.
- Supplementary input keys in `input_requirements.json` must exactly match the corresponding property names in `vat_rules.json`.
- Checkbox answers are represented as `YES` or `NO`.
- Rules are sorted by `rulePriority`, with the highest numeric priority winning.
- If two or more matching rules share the highest priority, the sector is marked **Review Required** and no rule is selected.

## Current calculation support

Only rules with `calculationMethod` equal to `STANDARD` are calculated automatically. Other methods are reported as **Review Required**.

## Current limitations

- `effectiveFrom` and `effectiveTo` are stored in rule data but are not yet evaluated.
- `tax_territories.json` is loaded, but airport-specific tax-territory selection is not yet active.
- The supplementary input renderer currently supports `CHECKBOX` controls only.
- The print report uses the browser print dialogue rather than a PDF library.

## Local testing

The project uses `fetch()` for JSON data, so serve the folder through a local web server instead of opening `index.html` directly from the file system.

Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Recommended regression checks

Before publishing a change, verify:

1. A single-sector calculation completes for a known rule.
2. A multi-sector itinerary totals correctly.
3. A supplementary checkbox appears only when applicable.
4. Changing away from an applicable supplementary input removes its stored value.
5. Equal-priority overlapping rules produce **Review Required**.
6. The print report contains each supplementary input only once.

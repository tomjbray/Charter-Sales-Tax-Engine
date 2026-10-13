# Charter Sales Tax Engine

Application version: **0.2.0-phase1**

## Start-up validation

The application validates all loaded tax configuration before enabling calculations. Blocking errors are shown in the status bar and listed in the browser console. Unsupported calculation methods are warnings because the existing calculation layer already returns **Review Required** for them.

Validation covers:

1. Required top-level JSON properties.
2. Duplicate `ruleId` values.
3. Duplicate dynamic `inputKey` values.
4. Missing or unknown entity home countries.
5. Rates and taxable percentages outside 0–1 or non-numeric values.
6. Calculation methods other than `STANDARD`.
7. Invalid ISO dates and end dates before start dates.
8. Dynamic input keys absent from the VAT-rule schema.
9. Unknown entity, country or tax-territory references.
10. Rules with identical matching criteria and priority.

## Matching conventions

- Blank and `ANY` rule values are wildcards.
- The highest numeric `rulePriority` wins.
- Two matches at the same highest priority produce **Review Required**.
- Dynamic checkbox values use `YES` and `NO`.
- Rates and taxable percentages are decimal fractions, so 19% is stored as `0.19`.

## Runtime files

- `airports.json`
- `countries.json`
- `input_requirements.json`
- `selling_entities.json`
- `tax_territories.json`
- `vat_rules.json`

## Current limitations

- Effective dates are validated but not yet used to select a rule for a transaction date.
- Only `STANDARD` calculations are automated.
- Supplementary input rendering currently supports `CHECKBOX` controls.
- Airport-specific tax-territory resolution is not yet active.

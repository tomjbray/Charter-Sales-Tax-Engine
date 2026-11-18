# Charter Sales Tax Engine

**Current architecture baseline: November 2026**

The Charter Sales Tax Engine is a browser-based, configuration-driven calculator for passenger and cargo charter tax treatment. The controlled Excel master workbook remains the source of truth for reference data, tax rules, required inputs and approved regression expectations. Office Script and Power Automate export the controlled JSON consumed by the application and tests.

The web application is now a client of a standalone calculation engine. Tax calculation orchestration is not embedded in the browser UI: `src/app.js` builds a calculation request and reference-data bundle, calls `calculate(request, referenceData)` in `src/calculation-engine.js`, and renders the returned result.

## Design principles

- Keep JavaScript generic wherever possible.
- Represent jurisdiction-specific behaviour in controlled workbook/reference data rather than hard-coded UI logic.
- Keep browser concerns separate from calculation concerns.
- Treat ambiguous rule matches as configuration errors, never as row-order decisions.
- Protect approved behaviour with regression tests and end-to-end calculation contracts.
- Do not accept a new or amended jurisdiction until JSON export succeeds, start-up validation is clean, browser checks pass and GitHub Actions is green.

## Repository structure

```text
.github/
  workflows/
    tax-rule-regression.yml

data/
  airports.json
  countries.json
  input_requirements.json
  mad_apportionment.json
  selling_entities.json
  tax_territories.json
  vat_rules.json
  ...other live/reference JSON

src/
  allocation.js
  app.js
  calculation-engine.js
  dynamic-inputs.js
  journey-context.js
  mad-apportionment.js
  rule-tests.js
  tax-engine.js
  territory-resolution.js

tests/
  data/
    apportioned_calculation_tests.json
    apportionment_tests.json
    calculation_contract_tests.json
    dynamic_input_tests.json
    effective_date_calculation_tests.json
    effective_date_tests.json
    journey_context_tests.json
    priority_tests.json
    rule_tests.json
    territory_tests.json

  runners/
    run-allocation-tests.mjs
    run-apportioned-calculation-tests.mjs
    run-apportionment-tests.mjs
    run-calculation-contract-tests.mjs
    run-dynamic-input-tests.mjs
    run-effective-date-calculation-tests.mjs
    run-effective-date-tests.mjs
    run-journey-context-tests.mjs
    run-priority-tests.mjs
    run-regression-tests.mjs
    run-territory-tests.mjs

index.html
styles.css
favicon.ico
package.json
README.md
```

`data/` contains operational/reference data used by the application. `tests/data/` contains regression fixtures and synthetic technical test data. This distinction is intentional.

## Application architecture

### `src/app.js`

Owns browser/UI behaviour:

- application start-up and JSON loading;
- start-up configuration validation;
- selling-entity and customer inputs;
- dynamic tax-input rendering;
- airport lookup and itinerary construction;
- route-map rendering;
- creation of the calculation request/reference-data bundle;
- invocation of `calculate(request, referenceData)`;
- results, traceability and tax-component rendering;
- PDF/print report generation.

`app.js` does **not** own the core tax calculation orchestration.

### `src/calculation-engine.js`

Provides the reusable calculation boundary:

```text
calculate(request, referenceData)
```

The module contains no DOM access, browser state, `fetch()` calls or rendering logic. It:

1. validates and normalises the calculation request;
2. derives journey-level context;
3. resolves tax territories and customer rule regions;
4. allocates charter value across sectors;
5. constructs normalised sector transactions;
6. selects the applicable tax rule;
7. applies standard or apportioned tax calculations;
8. creates tax components; and
9. returns sector results plus journey totals.

### `src/tax-engine.js`

Owns deterministic rule matching and calculation-status evaluation.

Matching includes:

- selling entity;
- charter type;
- customer type;
- customer rule region;
- VAT-registration status;
- origin/destination tax territories;
- controlled dynamic inputs;
- derived journey inputs; and
- effective-date eligibility when a transaction date is supplied.

Blank and `ANY` rule values are treated as wildcards. Eligible rules are resolved by highest numeric `rulePriority`. If more than one eligible rule has the same highest priority, the result is ambiguous and requires review.

### Supporting pure modules

- `allocation.js` owns Haversine sector distances, balancing allocation percentages and charter-value allocation.
- `journey-context.js` derives journey facts such as `HomeRoundTrip` without jurisdiction-specific tax treatment.
- `territory-resolution.js` resolves home-country, EU/non-EU and controlled special tax territories.
- `mad-apportionment.js` performs controlled MAD/Balearic airport-pair apportionment lookup.
- `dynamic-inputs.js` determines which controlled supplementary inputs are applicable to the current transaction context.
- `rule-tests.js` runs the browser rule-regression diagnostics against the same production matcher.

## Controlled data flow

The intended control chain is:

```text
VAT_Rules_Master_Starter.xlsx
        |
        | Office Script
        v
controlled JSON export
        |
        | Power Automate
        v
Exports / repository JSON
        |
        +--> data/          runtime/reference data
        |
        +--> tests/data/    approved regression expectations
        v
calculation engine + GitHub Actions + browser validation
```

The workbook is the controlled source for business configuration. Generated JSON should not be treated as an independent source of business rules.

## Start-up validation

The browser validates loaded tax configuration before enabling calculations. Validation uses three severities:

- **ERROR**: calculation is blocked because the configuration may produce an unsafe result.
- **WARNING**: calculation remains available, but configuration requires attention.
- **INFO**: records expected work-in-progress/reference-data conditions.

Current validation covers:

- required top-level JSON structures;
- duplicate rule IDs;
- duplicate dynamic input keys;
- missing/unknown selling-entity home countries;
- rates and taxable percentages outside 0-1 or non-numeric values;
- unsupported calculation methods;
- invalid ISO effective dates and end-before-start ranges;
- dynamic input keys absent from the VAT-rule schema;
- unknown entity/country/territory references; and
- potentially ambiguous rules with identical matching criteria and priority.

A clean controlled baseline reports zero start-up errors and zero warnings.

## Effective-date rule selection

The rule engine supports `effectiveFrom` and `effectiveTo` using ISO `YYYY-MM-DD` dates.

Rules are eligible when:

```text
transactionDate >= effectiveFrom   (where effectiveFrom exists)
and
transactionDate <= effectiveTo     (where effectiveTo exists)
```

Both boundaries are inclusive.

If `transactionDate` is blank/null, date filtering is deliberately disabled to preserve legacy/current behaviour. The calculation engine accepts and propagates a transaction date, but the current browser UI does not yet collect a controlled tax-point date and therefore submits `null`.

An overlap between two otherwise matching rules at the same highest priority remains an ambiguity. Effective dating is an eligibility filter, not an extra tie-breaker.

## Calculation contracts

`tests/data/calculation_contract_tests.json` contains **12 approved end-to-end calculation contracts (CT001-CT012)** exported from the controlled workbook.

They protect complete behaviour across representative BRU, FRA, JNB and MAD scenarios, including:

- standard single-sector calculations;
- multi-sector distance/value allocation;
- DirectExporter logic;
- HomeRoundTrip-derived journey context;
- Spanish Mainland/Balearic apportionment;
- Canary Islands IGIC treatment; and
- qualifying medevac treatment.

The contract runner calls `calculate(request, referenceData)` directly and compares totals, sectors, matched rules, allocation, apportionment and tax components against approved expectations using controlled tolerances.

## Effective-date tests

Effective dating is protected at two levels:

- **10 matcher-level tests** (`effective_date_tests.json`) covering open-ended dates, inclusive boundaries, predecessor/successor rules, no-match dates and overlapping same-priority ambiguity.
- **3 full-engine tests** (`effective_date_calculation_tests.json`) proving transaction date propagation through `calculate()` and the resulting tax amount/status.

## Regression controls

The application currently maintains **102 controlled browser/rule regression tests** in addition to the specialist Node suites and the 12 approved calculation contracts.

GitHub Actions performs:

1. JavaScript syntax checks;
2. the main regression suite (`npm test`);
3. allocation tests;
4. calculation-contract tests;
5. effective-date matcher tests; and
6. effective-date full-calculation tests.

The workflow runs for changes under `src/`, `data/`, `tests/`, `package.json`, `index.html` or the workflow itself, and can also be run manually via `workflow_dispatch`.

## Matching conventions

- Blank and `ANY` rule criteria are wildcards.
- Dynamic inputs use workbook-defined keys such as `DirectExporter` and `QualifyingMedevac`.
- Journey-derived facts such as `HomeRoundTrip` are calculated generically and matched like other rule criteria.
- Effective dates restrict rule eligibility when `transactionDate` is supplied.
- Highest numeric `rulePriority` wins among eligible matches.
- Multiple eligible matches at the same highest priority produce **Review Required** rather than falling back to JSON/Excel row order.
- No eligible rule produces **Review Required**.

## Apportioned calculations

`APPORTIONED` is supported for controlled MAD Mainland/Balearic routes.

The engine:

1. looks up the controlled airport pair in `mad_apportionment.json`;
2. applies the configured taxable/non-taxable percentages;
3. creates separate taxable and non-taxable components; and
4. returns the component breakdown as part of the calculation result.

Missing required apportionment data produces **Review Required** rather than silently using a default.

## Adding a new jurisdiction

Use this controlled onboarding sequence:

1. Define and review the jurisdiction's business/tax logic in the master workbook.
2. Add required selling entity, country, territory and reference data.
3. Add VAT rules with unique IDs, legal references, calculation methods, effective dates and intentional priorities.
4. Identify any additional transaction facts required for rule selection.
5. Add new controlled `InputRequirements` and rule columns where a dynamic input is required.
6. Keep journey-level facts generic. Add jurisdiction-specific meaning in VATRules rather than hard-coding it into the derivation module.
7. Add/approve rule regression expectations for the new decision boundaries.
8. Add end-to-end calculation contracts for material new calculation behaviours.
9. Update effective-date coverage when introducing predecessor/successor rules.
10. Run the Office Script and Power Automate export successfully.
11. Copy/export runtime JSON to `data/` and controlled test fixtures to `tests/data/` as appropriate.
12. Confirm start-up validation is clean.
13. Confirm browser rule regressions pass.
14. Run the complete GitHub Actions workflow.
15. Manually sense-check representative browser calculations, traceability, tax components and PDF/print output.
16. Do not treat the jurisdiction as complete until both the new tests and the existing baseline remain green.

## Working with the repository

### Browser

The static site is served from `index.html`, which loads `src/app.js`. Runtime JSON is fetched from `data/`. The browser rule-regression fixture is under `tests/data/`.

### Node tests

`package.json` exposes the main regression chain and targeted test commands. The full GitHub workflow also runs specialist suites that sit outside the base `npm test` chain.

### GitHub Actions

`.github/workflows/tax-rule-regression.yml` is the permanent regression gate. Changes to production code, runtime/reference data or regression fixtures/runners should trigger it.

## Current scope and known boundaries

- The controlled rule set currently contains **175 VAT rules**.
- The calculation-contract baseline currently contains **12 approved contracts**.
- The browser/rule regression baseline currently contains **102 tests**.
- Effective-date selection is implemented in the engine, but the browser does not yet collect a transaction/tax-point date.
- `STANDARD` and controlled `APPORTIONED` calculations are automated.
- The web UI remains the current human-facing client, but core calculation orchestration is browser-independent and suitable for a later API/service wrapper.
- The engine does not determine the legal tax point. A caller supplying `transactionDate` is responsible for supplying the appropriate business/tax date.

## Change-completion gate

For any material rule, data or calculation change, completion means all applicable controls are green:

1. workbook/reference-data change reviewed;
2. JSON export succeeds;
3. browser start-up validation has no blocking errors;
4. controlled regression tests pass;
5. calculation contracts pass where applicable;
6. specialist technical tests pass;
7. representative manual browser checks pass; and
8. GitHub Actions is green.

The objective is reproducibility: the same controlled inputs and reference data should produce the same tax result whether calculation is invoked from the current browser or a future system integration.

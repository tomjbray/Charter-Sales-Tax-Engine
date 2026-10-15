## Charter Sales Tax Engine

Application version: **0.2.3-phase2b-regression**

The Charter Sales Tax Engine is a browser-based, configuration-driven calculator for passenger and cargo charter tax treatment. Excel master-data tables remain the source of truth; Office Script and Power Automate export the runtime JSON consumed by the application.

### Architecture

The JavaScript is split into three principal layers:

- `app.js` — application start-up, data loading, user interface, itinerary handling, calculation orchestration, traceability and PDF/print output.
- `tax-engine.js` — reusable rule matching and calculation-status logic with no user-interface dependency.
- `rule-tests.js` — browser regression-test loading, execution, comparison and console reporting.

`tax-engine.js` is shared by both the live calculator and the regression-test runner so that tests exercise the same matching logic as production calculations.

### Start-up validation

The application validates all loaded tax configuration before enabling calculations. Blocking errors are shown in the status bar and listed in the browser console. Unsupported calculation methods are warnings because the calculation layer returns **Review Required** for them.

Validation covers:

- Required top-level JSON properties.
- Duplicate `ruleId` values.
- Duplicate dynamic `inputKey` values.
- Missing or unknown entity home countries.
- Rates and taxable percentages outside 0–1 or non-numeric values.
- Calculation methods other than `STANDARD`.
- Invalid ISO dates and end dates before start dates.
- Dynamic input keys absent from the VAT-rule schema.
- Unknown entity, country or tax-territory references.
- Rules with identical matching criteria and priority.

### Matching conventions

- Blank and `ANY` rule values are wildcards.
- The highest numeric `rulePriority` wins.
- Two matches at the same highest priority produce **Review Required**.
- Dynamic checkbox values use `YES` and `NO`.
- Rates and taxable percentages are decimal fractions, so 19% is stored as `0.19`.
- Rule matching receives the transaction and VAT-rule array explicitly, allowing the same engine to run in the browser and under Node.js.

### Dynamic inputs

Jurisdiction-specific questions are data-driven through `input_requirements.json` rather than hard-coded into `app.js`.

The current implementation supports:

- Applicability by selling entity, customer country and charter type.
- Configured labels, defaults, display order and tooltips.
- Dynamic values flowing into the transaction, rule matcher, traceability output and PDF/print report.
- `CHECKBOX` rendering using the `YES`/`NO` convention.

Additional VAT-rule columns are exported dynamically by the Office Script. New country-specific criteria should therefore normally be introduced through the Excel `VATRules` and `InputRequirements` tables rather than by adding country-specific JavaScript.

### Regression testing

`rule_tests.json` is an active regression suite. Each enabled test contains:

- A unique test ID and description.
- An input transaction.
- Optional dynamic inputs.
- Expected rule ID.
- Expected treatment.
- Expected rate.
- Expected taxable percentage.
- Expected calculation status.

The browser runs the suite after core tax data loads and reports detailed PASS/FAIL results in the developer console. Regression-test loading or test failures do **not** disable the live calculator.

The current controlled baseline contains **24 enabled tests** covering representative Belgium and France/German-operation scenarios. The baseline currently passes **24/24** in both the browser and GitHub Actions.

Test expectations must not be regenerated automatically when VAT rules change. A failure must be investigated to determine whether the rule/configuration is wrong or whether an approved tax change requires a deliberate update to the expected result.

### GitHub Actions

The repository includes an automated workflow:

```text
.github/workflows/tax-rule-regression.yml
```

The workflow:

1. Checks out the repository.
2. Sets up Node.js.
3. checks the syntax of `app.js`, `tax-engine.js` and `rule-tests.js`.
4. Runs `scripts/run-regression-tests.mjs` against `vat_rules.json` and `rule_tests.json`.
5. Fails the workflow when one or more enabled regression tests fail.

The workflow is triggered by relevant pushes and pull requests to `main`, and can also be run manually with `workflow_dispatch`.

The same suite can be run locally from the repository root with:

```bash
npm test
```

No third-party npm packages are required for the regression runner.

### Runtime and control files

Core runtime files include:

- `airports.json`
- `countries.json`
- `input_requirements.json`
- `selling_entities.json`
- `tax_territories.json`
- `vat_rules.json`
- `rule_tests.json`

Supporting application/control files include:

- `app.js`
- `tax-engine.js`
- `rule-tests.js`
- `scripts/run-regression-tests.mjs`
- `.github/workflows/tax-rule-regression.yml`
- `package.json`

### Adding a new country or jurisdiction

Use the following controlled onboarding sequence:

1. Complete and review the tax logic, including rates, taxable percentages, treatments, calculation methods and legal references.
2. Add the selling entity, country, territory and other reference data required by the new jurisdiction.
3. Add the VAT rules with unique rule IDs and appropriate priorities.
4. Identify whether the jurisdiction requires any new transaction facts or special decision inputs.
5. Add new definitions to `InputRequirements` and new dynamic VAT-rule columns when needed.
6. Review the Office Script. Change it only when the new data is not already handled by the generic export model.
7. Add representative regression tests covering decision boundaries, including positive/negative pairs for special conditions.
8. Run the Office Script and Power Automate JSON export successfully.
9. Confirm start-up/configuration validation is clean.
10. Confirm the browser regression suite passes in full.
11. Manually sense-check important calculations, displayed inputs, traceability and PDF/print output.
12. Commit the changes and confirm the GitHub Actions workflow passes in full.
13. Treat the approved tests as part of the controlled baseline for future changes.

New country logic is not complete until the new tests and the existing regression baseline are all green.

### Current limitations

- Effective dates are validated but not yet used to select a rule for a transaction date.
- Only `STANDARD` calculations are automated.
- Supplementary input rendering currently supports `CHECKBOX` controls.
- Airport-specific tax-territory resolution is not yet active.
- Regression tests validate rule matching and calculation status, not browser layout, mapping or print styling.
- GitHub Actions currently validates changes after they reach the configured branch. Branch protection and required pull-request checks are not yet configured.

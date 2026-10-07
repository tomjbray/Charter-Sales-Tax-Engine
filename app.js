// ═══════════════════════════════════════════════════════════
//  Charter Sales Tax Engine — app.js
//
//  Main responsibilities:
//  1. Load airport, aircraft, registry and VAT reference data.
//  2. Build the itinerary used by both route planning and VAT.
//  3. Plot routes and calculate distance.
//  4. Match each itinerary sector to the appropriate VAT rule.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  1. APPLICATION STATE
// ═══════════════════════════════════════════════════════════

// Core reference data
let AIRPORTS = {};
let AIRCRAFT = {};
let REGISTRY = {};
let REGISTRY_BY_TYPE = {};

// Data-loading flags
let dbLoaded = false;
let acLoaded = false;
let regLoaded = false;

// Current route and itinerary
let origAirport = null;
let destAirport = null;
let itinerary = [];

/*
 * Additional sectors entered after the primary route.
 *
 * The existing Origin and Destination controls remain Sector 1.
 * Each object below represents Sector 2 onwards.
 */
let additionalSectors = [];
let nextSectorId = 2;

// Map and tracking layers
let routeLayers = [];
let trackingLayers = [];

// VAT reference data
let selectedEntity = "BRU";
let selectedCharterType = "PASSENGER";
let selectedCustomerType = "PRIVATE";
let selectedCustomerCountry = "BE";
let selectedVatRegistered = "NO";
let sellingEntitiesData = null;
let vatRulesData = null;
let taxTerritoriesData = null;
let countriesData = null;
let charterValue = 0;

// Dynamic VAT-input configuration loaded from input_requirements.json.
// The current renderer uses this file for validation/readiness; the next phase
// will use its input definitions to generate controls conditionally.
let inputRequirementsData = null;

// ═══════════════════════════════════════════════════════════
//  2. DATA LOADING
// ═══════════════════════════════════════════════════════════

/**
 * Coordinates application start-up by loading core and VAT reference data, initialising controls, restoring any airport input entered during loading, and starting the optional registry load.
 * @returns {Promise<void>}
 */

async function loadData() {
  const statusEl = document.getElementById('dbStatus');
  statusEl.classList.add('loading');

  try {
    // Core planner data is needed immediately for airport and aircraft searches.
    const [aptRes, acRes] = await Promise.all([
      fetch('./airports.json'),
      fetch('./aircraft_types.json'),
    ]);

    if (!aptRes.ok) throw new Error('airports.json: HTTP ' + aptRes.status);
    if (!acRes.ok) throw new Error('aircraft_types.json: HTTP ' + acRes.status);

    AIRPORTS = await aptRes.json();
    const acData = await acRes.json();

    // Remove the metadata entry because it is not an aircraft type.
    AIRCRAFT = Object.fromEntries(
      Object.entries(acData).filter(([key]) => key !== '_metadata')
    );

    dbLoaded = true;
    acLoaded = true;

    const aptCount = Object.keys(AIRPORTS).length;
    const acCount = Object.keys(AIRCRAFT).length;

    statusEl.textContent =
      aptCount.toLocaleString() + ' airports · ' +
      acCount + ' aircraft types · Loading registry…';

    // Load VAT reference data before any route can be evaluated for VAT.
    await Promise.all([
      loadCountries(),
      loadTaxTerritories(),
      loadVatRules(),
      loadSellingEntities()
    ]);

    /*
     * Initialise the existing VAT inputs as soon as their core
     * reference files are ready. A problem with the optional dynamic
     * input file must not remove Selling Entity or Customer Country.
     */
    populateSellingEntityDropdown();
    initialiseCustomerCountryTypeahead();
    initialiseCharterTypeSelector();
    initialiseCustomerTypeSelector();
    initialiseVatRegisteredSelector();
    syncVatRegisteredState();
    initialiseCharterValueInput();

    /*
     * Load the new dynamic-input file separately. This keeps the rest
     * of the application working while also reporting any file issue.
     */
    await loadInputRequirements();
    renderDynamicInputs();

    // Re-run airport lookups if the user typed while data was loading.
    const originValue = document.getElementById('origInput').value;
    const destinationValue = document.getElementById('destInput').value;

    if (originValue.length === 3) {
      lookupAirport(originValue, document.getElementById('origInfo'), true);
    }

    if (destinationValue.length === 3) {
      lookupAirport(destinationValue, document.getElementById('destInfo'), false);
    }

    // Registry loading is non-blocking because it is not needed for route entry.
    loadRegistry(aptCount, acCount);

  } catch (error) {
    statusEl.textContent = '⚠ Data load failed: ' + error.message;
    console.error(error);
  }
}

/**
 * Loads the country reference dataset used by customer-country typeahead and VAT region classification.
 * @returns {Promise<void>}
 */

async function loadCountries() {
  const response = await fetch('./countries.json');
  if (!response.ok) throw new Error('countries.json: HTTP ' + response.status);

  countriesData = await response.json();
  console.log(`Loaded ${countriesData.recordCount} countries`);
}

/**
 * Loads and validates the configuration that will drive conditional VAT inputs.
 * @returns {Promise<void>}
 */

async function loadInputRequirements() {
    const response = await fetch('./input_requirements.json');

    if (!response.ok) {
        throw new Error(
            'input_requirements.json: HTTP ' + response.status
        );
    }

    inputRequirementsData = await response.json();

    if (!Array.isArray(inputRequirementsData?.inputs)) {
        throw new Error(
            'input_requirements.json does not contain an inputs array.'
        );
    }

    console.log(
        `Loaded ${inputRequirementsData.inputCount} input requirements`
    );
}

/**
 * Loads selling-entity reference data, including each entity’s home country.
 * @returns {Promise<void>}
 */

async function loadSellingEntities() {
    const response =
        await fetch('./selling_entities.json');

    if (!response.ok) {
        throw new Error(
            'selling_entities.json: HTTP ' +
            response.status
        );
    }

    sellingEntitiesData =
        await response.json();

    console.log(
        `Loaded ${sellingEntitiesData.recordCount} selling entities`
    );
}

/**
 * Loads country-to-tax-territory mappings used where a country may contain distinct VAT territories.
 * @returns {Promise<void>}
 */

async function loadTaxTerritories() {
  const response = await fetch('./tax_territories.json');
  if (!response.ok) throw new Error('tax_territories.json: HTTP ' + response.status);

  taxTerritoriesData = await response.json();
  console.log(`Loaded ${taxTerritoriesData.recordCount} tax territories`);
}

/**
 * Loads the VAT rule matrix used for sector-by-sector rule matching.
 * @returns {Promise<void>}
 */

async function loadVatRules() {
  const response = await fetch('./vat_rules.json');
  if (!response.ok) throw new Error('vat_rules.json: HTTP ' + response.status);

  vatRulesData = await response.json();
  console.log(`Loaded ${vatRulesData.ruleCount} VAT rules`);
}

/**
 * Loads aircraft registry data without blocking route entry, then indexes records by aircraft type for fast lookup.
 *
 * @param {number} aptCount - Loaded airport count for the status message.
 * @param {number} acCount - Loaded aircraft-type count for the status message.
 * @returns {Promise<void>}
 */

async function loadRegistry(aptCount, acCount) {
  try {
    const res = await fetch('./aircraft_registry.json');
    if (!res.ok) {
      document.getElementById('dbStatus').textContent =
        aptCount.toLocaleString() + ' airports · ' + acCount + ' aircraft types';
      return;
    }

    REGISTRY = await res.json();
    regLoaded = true;

    // Pre-group by type_code for fast lookup
    for (const entry of Object.values(REGISTRY)) {
      const tc = entry.type_code;
      if (!REGISTRY_BY_TYPE[tc]) REGISTRY_BY_TYPE[tc] = [];
      REGISTRY_BY_TYPE[tc].push(entry);
    }

    const regCount = Object.keys(REGISTRY).length;
    const statusEl = document.getElementById('dbStatus');
    statusEl.textContent =
      aptCount.toLocaleString() + ' airports · ' +
      acCount + ' aircraft types · ' +
      regCount.toLocaleString() + ' registered aircraft';
    statusEl.classList.remove('loading');
    statusEl.classList.add('ready');

  } catch(e) {
    console.warn('Registry load failed:', e.message);
    const statusEl2 = document.getElementById('dbStatus');
    statusEl2.textContent = aptCount.toLocaleString() + ' airports · ' + acCount + ' aircraft types';
    statusEl2.classList.remove('loading');
    statusEl2.classList.add('ready');
  }
}

// ═══════════════════════════════════════════════════════════
//  3. VAT REGION AND TERRITORY CLASSIFICATION
// ═══════════════════════════════════════════════════════════

// getRuleRegion() provides the broad region used by the current BRU matrix.
// getTaxTerritory() is reserved for specific territory distinctions such as
// ES_MAINLAND, ES_BALEARIC and ES_CANARY when airport-level mappings are added.



/**
 * Converts an ISO country code into the rule-region value expected by the VAT matrix, preserving the selling entity’s home country as a distinct value.
 *
 * @param {string} countryCode - ISO country code to classify.
 * @param {string} homeCountry - ISO country code of the selected selling entity.
 * @returns {string|null}
 */



function getRuleRegion(
          countryCode,
          homeCountry
         ) {
  if (!countryCode) return null;

  const country = countriesData?.data?.[countryCode];

  // If a country is not yet in the reference file, preserve its country code.
  // This avoids silently treating unknown data as non-EU.
  if (!country) return countryCode;

  // Domestic country must always map to itself
  if (countryCode === homeCountry) {
        return homeCountry;
}


  // Belgium must remain distinct because the BRU rule matrix uses BE explicitly.
  //if (countryCode === 'BE') return 'BE';

  // Support both proper JSON booleans and text values from older exports.
const euFlag =
    country.eUMember ?? country.euMember;

const isEuMember =
    euFlag === true ||
    String(euFlag).toUpperCase() === 'TRUE';
 
      return isEuMember ? 'EU' : 'NON_EU';


}

/**
 * Returns a unique tax-territory code for a country when exactly one mapping exists; otherwise returns the country code to avoid an unsafe assumption.
 *
 * @param {string} countryCode - ISO country code to resolve.
 * @returns {string}
 */

function getTaxTerritory(countryCode) {
  if (!countryCode || !taxTerritoriesData?.data) return countryCode;

  const matchingTerritories = Object.entries(taxTerritoriesData.data)
    .filter(([, territory]) => territory.country === countryCode);

  // A country can have several tax territories, such as mainland Spain,
  // the Balearic Islands and the Canary Islands. Country alone is therefore
  // insufficient to choose safely when more than one territory exists.
  if (matchingTerritories.length !== 1) return countryCode;

  return matchingTerritories[0][0];
}

/**
 * Returns the home-country code for a selling entity.
 *
 * @param {string} entityCode - Selling-entity identifier.
 * @returns {string|null}
 */

function getEntityCountry(entityCode) {
 
    const entity =
        sellingEntitiesData?.data?.[entityCode];

    if (!entity)
        return null;

    return entity.country;
}

// ═══════════════════════════════════════════════════════════
//  4. VAT RULE MATCHING AND DISPLAY
// ═══════════════════════════════════════════════════════════

/**
 * Tests one VAT rule field against a transaction field, treating blank and ANY rule values as wildcards.
 *
 * @param {string} ruleValue - Value stored in the VAT rule.
 * @param {string} inputValue - Derived or selected transaction value.
 * @returns {boolean}
 */

function valueMatches(
    ruleValue,
    inputValue
) {

    if (
        !ruleValue ||
        ruleValue === "ANY"
    ) {
        return true;
    }

    return ruleValue === inputValue;
}

/**
 * Filters the VAT rule matrix against all transaction dimensions and returns the first matching rule.
 *
 * @param {Object} transaction - Normalised VAT transaction for one itinerary sector.
 * @returns {Object|null}
 */

function findMatchingRule(
    transaction
) {

    if (
        !vatRulesData ||
        !vatRulesData.rules
    ) {
        return null;
    }

    const matches =
        vatRulesData.rules.filter(
            rule =>

                valueMatches(
                    rule.entity,
                    transaction.entity
                )

                &&

                valueMatches(
                    rule.charterType,
                    transaction.charterType
                )

                &&

                valueMatches(
                    rule.customerType,
                    transaction.customerType
                )

                &&

                valueMatches(
                    rule.customerLocation,
                    transaction.customerLocation
                )

                &&

                valueMatches(
                    rule.vatRegistered,
                    transaction.vatRegistered
                )

                &&

                valueMatches(
                    rule.originTerritory,
                    transaction.originTerritory
                )

                &&

                valueMatches(
                    rule.destinationTerritory,
                    transaction.destinationTerritory
                )
        );

    

    return matches[0] || null;
}






/**
 * Removes all rendered sector VAT cards from the results container.
 */






function clearVatSectorResults() {

    const container =
        document.getElementById(
            "vatSectorResults"
        );

    if (container) {
        container.innerHTML = "";
    }
}


/**
 * Escapes text before inserting it into HTML templates to prevent markup injection.
 *
 * @param {*} value - Value to convert to safe display text.
 * @returns {string}
 */


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/**
 * Validates whether a matched rule has a supported calculation method, numeric rate, and numeric taxable percentage.
 *
 * @param {Object|null} matchedRule - Matched VAT rule, or null when no rule matched.
 * @returns {{{canCalculate: boolean, status: string, reasons: string[]}}}
 */


function evaluateVatCalculationStatus(matchedRule) {
    const reasons = [];

    if (!matchedRule) {
        reasons.push("No matching VAT rule was found.");
    } else {
        const calculationMethod =
            String(matchedRule.calculationMethod || "")
                .trim()
                .toUpperCase();

        if (!calculationMethod) {
            reasons.push("The rule has no calculation method.");
        } else if (calculationMethod !== "STANDARD") {
            reasons.push(
                `Calculation method ${calculationMethod} is not yet supported.`
            );
        }

        if (
            matchedRule.rate === null ||
            matchedRule.rate === undefined ||
            matchedRule.rate === "" ||
            !Number.isFinite(Number(matchedRule.rate))
        ) {
            reasons.push("The rule has no valid VAT rate.");
        }

        if (
            matchedRule.taxablePercent === null ||
            matchedRule.taxablePercent === undefined ||
            matchedRule.taxablePercent === "" ||
            !Number.isFinite(Number(matchedRule.taxablePercent))
        ) {
            reasons.push("The rule has no valid taxable percentage.");
        }
    }

    return {
        canCalculate: reasons.length === 0,
        status: reasons.length === 0 ? "Complete" : "Review Required",
        reasons
    };
}

/**
 * Formats a finite numeric amount to two decimal places, or returns a review message for unavailable values.
 *
 * @param {number|null} value - Amount to format.
 * @returns {string}
 */

function formatMoneyValue(value) {
    if (!Number.isFinite(value)) {
        return "Review Required";
    }

    return value.toLocaleString(
        undefined,
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

/**
 * Builds and displays the detailed derived-input, rule-match, distance-allocation, and VAT-calculation card for every itinerary sector.
 *
 * @param {Object[]} results - Sector VAT calculation results.
 */

function renderVatSectorResults(
    results
) {

    const container =
        document.getElementById(
            "vatSectorResults"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    results.forEach(result => {

        const {
            sector,
            transaction,
            homeCountry,
            matchedRule,
            distanceNm,
            distancePercentage,
            totalDistanceNm,
            allocatedNetValue,
            taxablePercent,
            taxableValue,
            vatAmount,
            grossValue,
            calculationStatus,
            reviewReasons
        } = result;

        const card =
            document.createElement(
                "section"
            );

        card.className =
            "vat-sector-card";

        const routeLabel =
            `${sector.origin.iata} → ` +
            `${sector.destination.iata}`;

        const ruleId =
            matchedRule
                ? matchedRule.ruleId
                : "NO MATCH";

        const treatment =
            matchedRule
                ? matchedRule.treatment
                : "Review Required";

        const rate =
            matchedRule
                ? (
                    matchedRule.rate * 100
                ).toFixed(2) + "%"
                : "-";

        const priority =
            matchedRule
                ? matchedRule.rulePriority
                : "-";

        const explanation =
            matchedRule
                ? (
                    matchedRule.ruleExplanation ||
                    "-"
                )
                : (
                    "No VAT rule matches this " +
                    "sector and the selected VAT inputs."
                );

        const legalReference =
            matchedRule
                ? (
                    matchedRule.legalReference ||
                    "-"
                )
                : "Review VAT matrix";

        card.innerHTML = `
            <div class="vat-sector-heading">

                <div>
                    Sector ${sector.sectorNumber}
                </div>

                <strong>
                    ${escapeHtml(routeLabel)}
                </strong>

            </div>

            <div class="vat-sector-columns">

                <div class="vat-panel">

                    <h3>
                        Derived Rule Inputs
                    </h3>

                    ${createVatResultRow(
                        "Home Country",
                        homeCountry
                    )}

                    ${createVatResultRow(
                        "Customer Region",
                        transaction.customerLocation
                    )}

                    ${createVatResultRow(
                        "Origin Territory",
                        transaction.originTerritory
                    )}

                    ${createVatResultRow(
                        "Destination Territory",
                        transaction.destinationTerritory
                    )}

                    ${createVatResultRow(
                        "VAT Registered",
                        transaction.vatRegistered
                    )}

                </div>

                <div class="vat-panel">

                    <h3>
                        VAT Rule Match
                    </h3>

                    ${createVatResultRow(
                        "Calculation Status",
                        calculationStatus,
                        calculationStatus === "Complete"
                            ? "calculation-complete"
                            : "no-match"
                    )}

                    ${createVatResultRow(
                        "Review Reason",
                        reviewReasons.length
                            ? reviewReasons.join(" ")
                            : "-"
                    )}

                    ${createVatResultRow(
                        "Rule ID",
                        ruleId,
                        matchedRule
                            ? ""
                            : "no-match"
                    )}

                    ${createVatResultRow(
                        "Treatment",
                        treatment
                    )}

                    ${createVatResultRow(
                        "Rate",
                        rate
                    )}

                    ${createVatResultRow(
                        "Priority",
                        priority
                    )}

                    ${createVatResultRow(
                        "Explanation",
                        explanation
                    )}

                    ${createVatResultRow(
                        "Legal Reference",
                        legalReference
                    )}

                    ${createVatResultRow(
                        "Sector Distance",
                        Math.round(distanceNm).toLocaleString() + " nm"
                    )}

                    ${createVatResultRow(
                        "Itinerary Distance",
                        Math.round(totalDistanceNm).toLocaleString() + " nm"
                    )}

                    ${createVatResultRow(
                        "Distance Allocation",
                        distancePercentage.toFixed(2) + "%"
                    )}

                    ${createVatResultRow(
                        "Allocated Value",
                        formatMoneyValue(allocatedNetValue)
                    )}

                    ${createVatResultRow(
                    "Taxable Percentage",
                    Number.isFinite(taxablePercent)
                        ? (taxablePercent * 100).toFixed(2) + "%"
                        : "Review Required"
                    )}

                    ${createVatResultRow(
                    "Taxable Amount",
                    formatMoneyValue(taxableValue)
                    )}

                    ${createVatResultRow(
                    "VAT Amount",
                    formatMoneyValue(vatAmount)
                      )}

                     ${createVatResultRow(
                      "Gross Amount",
                      formatMoneyValue(grossValue)
                      )} 

                </div>

            </div>
        `;

        container.appendChild(
            card
        );
    });
}


/**
 * Creates one escaped label/value row for a VAT result panel.
 *
 * @param {string} label - Row label.
 * @param {*} value - Displayed value.
 * @param {string} extraClass - Optional CSS class for the value.
 * @returns {string}
 */


function createVatResultRow(
    label,
    value,
    extraClass = ""
) {

    const displayedValue =
        value === null ||
        value === undefined ||
        value === ""
            ? "-"
            : value;

    return `
        <div class="vat-result-row">

            <span class="vat-result-label">
                ${escapeHtml(label)}
            </span>

            <strong
                class="vat-result-value ${escapeHtml(extraClass)}">

                ${escapeHtml(displayedValue)}

            </strong>

        </div>
    `;
}

/**
 * Populates the selling-entity selector and reruns VAT evaluation when the selection changes.
 */

function populateSellingEntityDropdown() {

    const select =
        document.getElementById(
            "sellingEntitySelect"
        );

    select.innerHTML = "";

    Object.keys(
        sellingEntitiesData.data
    )
    .sort()
    .forEach(entityCode => {

        const option =
            document.createElement("option");

        option.value = entityCode;
        option.textContent = entityCode;

        if (
            entityCode === selectedEntity
        ) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    select.addEventListener(
        "change",
        event => {

            selectedEntity =
                event.target.value;

            runVatTest();
        }
    );
}

/**
 * Attaches charter-value input handling and reruns VAT allocation whenever the value changes.
 */

function initialiseCharterValueInput() {

    const input =
        document.getElementById(
            "charterValueInput"
        );

    input.addEventListener(
        "input",
        event => {

            charterValue =
                Number(
                    event.target.value
                ) || 0;

            runVatTest();
        }
    );
}

/**
 * Builds the customer-country datalist, displays the initial country, and wires validation for input, change, and blur events.
 */

function initialiseCustomerCountryTypeahead() {

    const input =
        document.getElementById(
            "customerCountryInput"
        );

    const datalist =
        document.getElementById(
            "customerCountryList"
        );

    if (
        !input ||
        !datalist ||
        !countriesData?.data
    ) {
        return;
    }

    datalist.innerHTML = "";

    const countries =
        Object.entries(
            countriesData.data
        )
        .map(
            ([code, country]) => ({
                code:
                    code.toUpperCase(),

                name:
                    country.name
            })
        )
        .sort(
            (firstCountry, secondCountry) =>
                firstCountry.name.localeCompare(
                    secondCountry.name
                )
        );

    countries.forEach(country => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            country.name;

        option.label =
            country.code;

        option.dataset.code =
            country.code;

        datalist.appendChild(
            option
        );
    });

    /*
     * Show the name matching the initial ISO code.
     */
    const initialCountry =
        countries.find(
            country =>
                country.code ===
                selectedCustomerCountry
        );

    if (initialCountry) {
        input.value =
            initialCountry.name;
    }

    /*
     * Update the selected country whenever the user
     * selects or enters a recognised country.
     */
    input.addEventListener(
        "change",
        () => {

            applyCustomerCountrySelection(
                input.value
            );
        }
    );

    /*
     * Also respond immediately when a recognised
     * country name or ISO code has been entered.
     */
    input.addEventListener(
        "input",
        () => {

            const match =
                findCountryFromInput(
                    input.value
                );

            if (match) {

                selectedCustomerCountry =
                    match.code;

                setCustomerCountryStatus(
                    `${match.name} (${match.code})`,
                    false
                );

                runVatTest();

            } else {

                setCustomerCountryStatus(
                    "",
                    false
                );
            }
        }
    );

    /*
     * Reject unrecognised text when the user leaves
     * the input.
     */
    input.addEventListener(
        "blur",
        () => {

            applyCustomerCountrySelection(
                input.value
            );
        }
    );

    if (initialCountry) {
        setCustomerCountryStatus(
            `${initialCountry.name} ` +
            `(${initialCountry.code})`,
            false
        );
    }
}


/**
 * Resolves an exact ISO country code or country name to the canonical country record.
 *
 * @param {string} inputValue - User-entered country code or name.
 * @returns {{{code: string, name: string}|null}}
 */


function findCountryFromInput(
    inputValue
) {

    if (
        !inputValue ||
        !countriesData?.data
    ) {
        return null;
    }

    const searchValue =
        inputValue
            .trim()
            .toLowerCase();

    /*
     * First allow an exact ISO-code match.
     *
     * Example:
     * FR → France
     */
    const codeMatch =
        Object.entries(
            countriesData.data
        )
        .find(
            ([code]) =>
                code.toLowerCase() ===
                searchValue
        );

    if (codeMatch) {

        return {
            code:
                codeMatch[0].toUpperCase(),

            name:
                codeMatch[1].name
        };
    }

    /*
     * Then look for an exact country-name match.
     *
     * Example:
     * France → FR
     */
    const nameMatch =
        Object.entries(
            countriesData.data
        )
        .find(
            ([, country]) =>
                country.name
                    .trim()
                    .toLowerCase() ===
                searchValue
        );

    if (!nameMatch) {
        return null;
    }

    return {
        code:
            nameMatch[0].toUpperCase(),

        name:
            nameMatch[1].name
    };
}


/**
 * Validates and canonicalises the customer-country entry, updates application state, and refreshes VAT results.
 *
 * @param {string} inputValue - Country value entered by the user.
 */


function applyCustomerCountrySelection(
    inputValue
) {

    const input =
        document.getElementById(
            "customerCountryInput"
        );

    const match =
        findCountryFromInput(
            inputValue
        );

    if (!match) {

        selectedCustomerCountry =
            null;

        setCustomerCountryStatus(
            "Please select a recognised country.",
            true
        );

        /*
         * Refresh the VAT panels so an old result
         * is not left on screen.
         */
        runVatTest();

        return;
    }

    selectedCustomerCountry =
        match.code;

    /*
     * Standardise the displayed value to the
     * official country name from countries.json.
     */
    input.value =
        match.name;

    setCustomerCountryStatus(
        `${match.name} (${match.code})`,
        false
    );

    runVatTest();
}


/**
 * Updates the customer-country validation message and its error styling.
 *
 * @param {string} message - Status text to display.
 * @param {boolean} isError - Whether to apply error styling.
 */


function setCustomerCountryStatus(
    message,
    isError
) {

    const status =
        document.getElementById(
            "customerCountryStatus"
        );

    if (!status) {
        return;
    }

    status.textContent =
        message;

    status.classList.toggle(
        "country-typeahead-error",
        isError
    );
}

/**
 * Initialises the charter-type selector and refreshes VAT results after a change.
 */

function initialiseCharterTypeSelector() {

    const selector =
        document.getElementById(
            "charterTypeSelect"
        );

    selector.value =
        selectedCharterType;

    selector.addEventListener(
        "change",
        event => {

            selectedCharterType =
                event.target.value;

            runVatTest();
        }
    );
}

/**
 * Initialises the customer-type selector, synchronises VAT-registration behaviour, and refreshes VAT results after a change.
 */

function initialiseCustomerTypeSelector() {
    const selector = document.getElementById("customerTypeSelect");

    selector.value = selectedCustomerType;

    selector.addEventListener("change", event => {
        selectedCustomerType = event.target.value;
        syncVatRegisteredState();
        runVatTest();
    });
}

/**
 * Initialises the VAT-registration selector and refreshes VAT results after a change.
 */

function initialiseVatRegisteredSelector() {

    const selector =
        document.getElementById(
            "vatRegisteredSelect"
        );

    selector.value =
        selectedVatRegistered;

    selector.addEventListener(
        "change",
        event => {

            selectedVatRegistered =
                event.target.value;

            runVatTest();
        }
    );
}

/**
 * Enforces NO and disables the VAT-registration selector for private customers; preserves a valid YES/NO choice for business customers.
 */

function syncVatRegisteredState() {

    const vatSelect =
        document.getElementById(
            "vatRegisteredSelect"
        );

    if (selectedCustomerType === "PRIVATE") {

        selectedVatRegistered = "NO";

        vatSelect.value = "NO";
        vatSelect.disabled = true;

    } else {

        if (
            selectedVatRegistered !== "YES" &&
            selectedVatRegistered !== "NO"
        ) {
            selectedVatRegistered = "YES";
        }

        vatSelect.value =
            selectedVatRegistered;

        vatSelect.disabled = false;
    }
}

/**
 * Builds the normalised VAT matching transaction and selling-entity home country for one sector.
 *
 * @param {Object} sector - Itinerary sector containing origin and destination airports.
 * @returns {{{transaction: Object, homeCountry: string|null}}}
 */

function buildVatTransaction(sector) {
    const homeCountry = getEntityCountry(selectedEntity);

    const transaction = {
        entity: selectedEntity,
        charterType: selectedCharterType,
        customerType: selectedCustomerType,
        customerLocation: getRuleRegion(
            selectedCustomerCountry,
            homeCountry
        ),
        vatRegistered: selectedVatRegistered,
        originTerritory: getRuleRegion(
            sector.origin.country,
            homeCountry
        ),
        destinationTerritory: getRuleRegion(
            sector.destination.country,
            homeCountry
        )
    };

    return {
        transaction,
        homeCountry
    };
}

/**
 * Aggregates sector calculations into itinerary totals and identifies any sectors requiring review.
 *
 * @param {Object[]} results - Sector VAT calculation results.
 */

function renderVatSummary(results) {
    const reviewResults = results.filter(
        result => result.calculationStatus !== "Complete"
    );

    const isComplete = reviewResults.length === 0;

    const totalNetValue = results.reduce(
        (sum, result) => sum + result.allocatedNetValue,
        0
    );

    const totalTaxableValue = isComplete
        ? results.reduce((sum, result) => sum + result.taxableValue, 0)
        : null;

    const totalVatValue = isComplete
        ? results.reduce((sum, result) => sum + result.vatAmount, 0)
        : null;

    const totalGrossValue = isComplete
        ? results.reduce((sum, result) => sum + result.grossValue, 0)
        : null;

    document.getElementById("summaryNetValue").textContent =
        formatMoneyValue(totalNetValue);
    document.getElementById("summaryTaxableValue").textContent =
        formatMoneyValue(totalTaxableValue);
    document.getElementById("summaryVatValue").textContent =
        formatMoneyValue(totalVatValue);
    document.getElementById("summaryGrossValue").textContent =
        formatMoneyValue(totalGrossValue);

    const statusElement =
        document.getElementById("summaryCalculationStatus");
    const reviewElement =
        document.getElementById("summaryReviewSectors");

    statusElement.textContent =
        isComplete ? "Complete" : "Review Required";
    statusElement.classList.toggle("summary-status-complete", isComplete);
    statusElement.classList.toggle("summary-status-review", !isComplete);

    reviewElement.textContent = reviewResults.length
        ? reviewResults
            .map(result => `Sector ${result.sector.sectorNumber}`)
            .join(", ")
        : "None";
}

/**
 * Evaluates every complete itinerary sector, allocates value by rounded distance percentage, calculates VAT where supported, and renders summary and detail results.
 * @returns {Object[]}
 */

function runVatTests() {
    if (itinerary.length === 0 || !vatRulesData) {
        clearVatSectorResults();
        return [];
    }

    if (!selectedCustomerCountry) {
        clearVatSectorResults();
        return [];
    }

    const sectorDistances = itinerary.map(sector => {
        return haversineNm(
            sector.origin.lat,
            sector.origin.lon,
            sector.destination.lat,
            sector.destination.lon
        );
    });

    const totalDistanceNm = sectorDistances.reduce(
        (total, distance) => total + distance,
        0
    );

    const distancePercentages = [];
    let allocatedPercentage = 0;

    sectorDistances.forEach((distanceNm, index) => {
        const isFinalSector = index === sectorDistances.length - 1;
        let distancePercentage;

        if (isFinalSector) {
            distancePercentage = Math.max(
                0,
                Number((100 - allocatedPercentage).toFixed(2))
            );
        } else {
            distancePercentage = totalDistanceNm > 0
                ? Number((distanceNm / totalDistanceNm * 100).toFixed(2))
                : 0;
            allocatedPercentage += distancePercentage;
        }

        distancePercentages.push(distancePercentage);
    });

    const results = itinerary.map((sector, index) => {
        const {
            transaction,
            homeCountry
        } = buildVatTransaction(sector);

        const matchedRule = findMatchingRule(transaction);
        const distancePercentage = distancePercentages[index];
        const allocatedNetValue =
            charterValue * (distancePercentage / 100);

        const calculationCheck =
            evaluateVatCalculationStatus(matchedRule);

        const taxablePercent = calculationCheck.canCalculate
            ? Number(matchedRule.taxablePercent)
            : null;
        const taxableValue = calculationCheck.canCalculate
            ? allocatedNetValue * taxablePercent
            : null;
        const vatAmount = calculationCheck.canCalculate
            ? taxableValue * Number(matchedRule.rate)
            : null;
        const grossValue = calculationCheck.canCalculate
            ? allocatedNetValue + vatAmount
            : null;

        return {
            sector,
            transaction,
            homeCountry,
            matchedRule,
            distanceNm: sectorDistances[index],
            distancePercentage,
            totalDistanceNm,
            allocatedNetValue,
            taxablePercent,
            taxableValue,
            vatAmount,
            grossValue,
            calculationStatus: calculationCheck.status,
            reviewReasons: calculationCheck.reasons
        };
    });

    renderVatSummary(results);
    renderVatSectorResults(results);
    return results;
}

/*
 * Compatibility wrapper.
 * Existing VAT input handlers call runVatTest().
 */
/**
 * Provides backward-compatible singular naming for existing input handlers while delegating to the multi-sector VAT evaluator.
 * @returns {Object[]}
 */
function runVatTest() {
    return runVatTests();
}

// ═══════════════════════════════════════════════════════════
//  5. MULTI-SECTOR ITINERARY CONTROLS
// ═══════════════════════════════════════════════════════════
/**
 * Adds a new optional itinerary sector, defaulting its origin to the previous valid destination.
 */
function addSector() {
    const previousDestination = getPreviousSectorDestination();

    const sector = {
        id: nextSectorId,
        originCode: previousDestination?.iata || "",
        destinationCode: "",
        origin: previousDestination || null,
        destination: null
    };

    additionalSectors.push(sector);
    nextSectorId++;

    renderAdditionalSectors();
    buildItinerary();
}

/**
 * Removes an additional sector and rebuilds the itinerary.
 *
 * @param {number} sectorId - Stable identifier of the sector to remove.
 */

function removeSector(sectorId) {
    additionalSectors = additionalSectors.filter(
        sector => sector.id !== sectorId
    );

    renderAdditionalSectors();
    buildItinerary();
}

/**
 * Returns the most recent additional-sector destination, or the primary destination when no additional sector exists.
 * @returns {Object|null}
 */

function getPreviousSectorDestination() {
    if (additionalSectors.length > 0) {
        return additionalSectors[additionalSectors.length - 1].destination;
    }

    return destAirport;
}

/**
 * Normalises an additional-sector IATA entry, resolves the airport, updates status, and rebuilds the itinerary.
 *
 * @param {number} sectorId - Stable sector identifier.
 * @param {string} field - Either origin or destination.
 * @param {string} value - User-entered IATA code.
 */

function updateAdditionalSectorAirport(sectorId, field, value) {
    const sector = additionalSectors.find(
        item => item.id === sectorId
    );

    if (!sector) return;

    const cleanCode = value.trim().toUpperCase();
    const airport = cleanCode.length === 3
        ? getAirport(cleanCode)
        : null;

    if (field === "origin") {
        sector.originCode = cleanCode;
        sector.origin = airport;
    } else {
        sector.destinationCode = cleanCode;
        sector.destination = airport;
    }

    renderAdditionalSectorStatus(sector, field);
    buildItinerary();
}

/**
 * Renders the current transitional “Direct Exporter” VAT checkbox. The loaded configuration is validated now and will drive conditional rendering in the next implementation phase.
 */

function renderDynamicInputs() {

    const container =
        document.getElementById(
            "dynamicVatInputs"
        );

    if (!container) {

        console.error(
            "dynamicVatInputs container not found"
        );

        return;
    }

    console.log(
        "Input requirements data:",
        inputRequirementsData
    );

    container.innerHTML = `
        <div class="vat-input-block">

            <label
                class="vat-input-label"
                for="directExporter">

                Additional VAT Inputs

            </label>

            <label>

                <input
                    type="checkbox"
                    id="directExporter">

                Customer is Direct Exporter

            </label>

        </div>
    `;
}

/**
 * Displays the resolved airport details or an error for one additional-sector field.
 *
 * @param {Object} sector - Additional-sector state object.
 * @param {string} field - Either origin or destination.
 */

function renderAdditionalSectorStatus(sector, field) {
    const infoElement = document.getElementById(
        `sector-${sector.id}-${field}-info`
    );

    if (!infoElement) return;

    const airport = field === "origin"
        ? sector.origin
        : sector.destination;

    const code = field === "origin"
        ? sector.originCode
        : sector.destinationCode;

    if (code.length < 3) {
        infoElement.textContent = "";
        return;
    }

    if (!airport) {
        infoElement.innerHTML =
            '<div class="apt-error">Code not found</div>';
        return;
    }

    infoElement.innerHTML =
        '<div class="apt-name">' + airport.name + '</div>' +
        '<div class="apt-meta">' +
        (airport.city || '') +
        (airport.city ? ' · ' : '') +
        airport.country +
        '</div>';
}

/**
 * Rebuilds all additional-sector controls and attaches their input and removal handlers.
 */

function renderAdditionalSectors() {
    const container = document.getElementById("additionalSectors");
    if (!container) return;

    container.innerHTML = "";

    additionalSectors.forEach((sector, index) => {
        const sectorNumber = index + 2;
        const element = document.createElement("div");

        element.className = "additional-sector-card";
        element.innerHTML = `
            <div class="additional-sector-header">
                <span>Sector ${sectorNumber}</span>

                <button
                    type="button"
                    class="remove-sector-btn"
                    data-sector-id="${sector.id}"
                    aria-label="Remove Sector ${sectorNumber}">
                    Remove
                </button>
            </div>

            <div class="additional-sector-fields">
                <div class="additional-sector-field">
                    <label for="sector-${sector.id}-origin">
                        Origin
                    </label>

                    <input
                        id="sector-${sector.id}-origin"
                        class="sector-iata-input"
                        maxlength="3"
                        autocomplete="off"
                        spellcheck="false"
                        value="${escapeHtml(sector.originCode)}"
                        placeholder="LBG">

                    <div
                        id="sector-${sector.id}-origin-info"
                        class="airport-detail">
                    </div>
                </div>

                <div class="sector-arrow">→</div>

                <div class="additional-sector-field">
                    <label for="sector-${sector.id}-destination">
                        Destination
                    </label>

                    <input
                        id="sector-${sector.id}-destination"
                        class="sector-iata-input"
                        maxlength="3"
                        autocomplete="off"
                        spellcheck="false"
                        value="${escapeHtml(sector.destinationCode)}"
                        placeholder="FRA">

                    <div
                        id="sector-${sector.id}-destination-info"
                        class="airport-detail">
                    </div>
                </div>
            </div>
        `;

        container.appendChild(element);

        const originInput = element.querySelector(
            `#sector-${sector.id}-origin`
        );

        const destinationInput = element.querySelector(
            `#sector-${sector.id}-destination`
        );

        const removeButton = element.querySelector(
            ".remove-sector-btn"
        );

        originInput.addEventListener("input", event => {
            updateAdditionalSectorAirport(
                sector.id,
                "origin",
                event.target.value
            );
        });

        destinationInput.addEventListener("input", event => {
            updateAdditionalSectorAirport(
                sector.id,
                "destination",
                event.target.value
            );
        });

        removeButton.addEventListener("click", () => {
            removeSector(sector.id);
        });

        renderAdditionalSectorStatus(sector, "origin");
        renderAdditionalSectorStatus(sector, "destination");
    });
}

// ═══════════════════════════════════════════════════════════
//  6. ITINERARY BUILDING
// ═══════════════════════════════════════════════════════════
/**
 * Reconstructs the itinerary from valid primary and additional sectors, then replots the map and reruns VAT evaluation.
 * @returns {Object[]}
 */
function buildItinerary() {
    itinerary = [];

    if (origAirport && destAirport) {
        itinerary.push({
            sectorNumber: 1,
            origin: origAirport,
            destination: destAirport
        });
    }

    additionalSectors.forEach(sector => {
        if (sector.origin && sector.destination) {
            itinerary.push({
                sectorNumber: itinerary.length + 1,
                origin: sector.origin,
                destination: sector.destination
            });
        }
    });

    if (itinerary.length === 0) {
        clearRoute();
        clearVatSectorResults();
        return itinerary;
    }

    plotItinerary();
    runVatTests();

    return itinerary;
}
// ═══════════════════════════════════════════════════════════
//  7. AIRPORT LOOKUP
// ═══════════════════════════════════════════════════════════

/**
 * Returns a normalised airport object for an IATA code, supporting both legacy array data and the current object format.
 *
 * @param {string} iata - Three-letter IATA airport code.
 * @returns {Object|null}
 */

function getAirport(iata) {
  const d = AIRPORTS[iata.toUpperCase().trim()];
  if (!d) return null;

  // Handle both old array format [name,country,city,lat,lon]
  // and new object format {name, country, city, lat, lon, icao, ...}
  if (Array.isArray(d)) {
    return { iata: iata.toUpperCase(), name: d[0], country: d[1], city: d[2], lat: d[3], lon: d[4] };
  }
  return { iata: iata.toUpperCase(), ...d };
}

/**
 * Validates a primary airport input, renders airport details, updates origin/destination state, and refreshes dependent UI.
 *
 * @param {string} iata - User-entered IATA code.
 * @param {HTMLElement} infoEl - Element used for airport status/details.
 * @param {boolean} isOrigin - True for origin; false for destination.
 */

function lookupAirport(iata, infoEl, isOrigin) {
  iata = iata.toUpperCase().trim();

  if (iata.length < 3) {
    infoEl.innerHTML = '';
    if (isOrigin) origAirport = null; else destAirport = null;
    updateUI();
    return;
  }

  if (!dbLoaded) {
    infoEl.innerHTML = '<div class="apt-loading">Loading database…</div>';
    if (isOrigin) origAirport = null; else destAirport = null;
    updateUI();
    return;
  }

  const ap = getAirport(iata);

  if (ap) {
    // Build the info display
    const icao      = ap.icao      ? ' · ' + ap.icao : '';
    const elevation = ap.elevation ? ' · ' + ap.elevation.toLocaleString() + ' ft' : '';

    // Runway info — show best (longest) runway if available
    let rwyHtml = '';
    if (ap.runways && ap.runways.length > 0) {
      const longest = Math.max(...ap.runways.map(r => r.length_ft || 0));
      if (longest > 0) {
        rwyHtml = '<div class="apt-rwy">Longest runway: ' + longest.toLocaleString() + ' ft</div>';
      }
    }

    infoEl.innerHTML =
      '<div class="apt-name">' + ap.name + '</div>' +
      '<div class="apt-meta">' + (ap.city || '') + (ap.city ? ' · ' : '') + ap.country + icao + elevation + '</div>' +
      rwyHtml;

    if (isOrigin) origAirport = ap; else destAirport = ap;

  } else {
    infoEl.innerHTML = '<div class="apt-error">Code not found</div>';
    if (isOrigin) origAirport = null; else destAirport = null;
  }

  updateUI();
}

// ═══════════════════════════════════════════════════════════
//  8. MAP SETUP AND ROUTE DRAWING
// ═══════════════════════════════════════════════════════════

/** Leaflet map instance shared by route and live-tracking features. */
const map = L.map('map', {
  center: [30, 10],
  zoom: 2,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(map);

/**
 * Removes all itinerary route lines and airport markers from the map.
 */

function clearRoute() {
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];
}



 /**
  * Draws every itinerary sector as a great-circle route, adds one marker per unique airport, and fits the map to the full itinerary.
  */



 function plotItinerary() {

    clearRoute();

    if (itinerary.length === 0) {
        return;
    }

    const allCoordinates = [];

    itinerary.forEach(
        (sector, index) => {

            const points = [];

            for (
                let step = 0;
                step <= 120;
                step++
            ) {
                const fraction =
                    step / 120;

                points.push(
                    interpolateGreatCircle(
                        sector.origin.lat,
                        sector.origin.lon,
                        sector.destination.lat,
                        sector.destination.lon,
                        fraction
                    )
                );
            }

            const segments =
                splitAtAntimeridian(
                    points
                );

            const colours = [
                "#9a7235",
                "#2a6fd4",
                "#2e8f60",
                "#c47a10",
                "#6030b0"
            ];

            const colour =
                colours[
                    index %
                    colours.length
                ];

            segments.forEach(
                segment => {

                    const line =
                        L.polyline(
                            segment,
                            {
                                color:
                                    colour,

                                weight: 3,
                                opacity: 0.85
                            }
                        )
                        .addTo(map);

                    routeLayers.push(
                        line
                    );
                }
            );

            allCoordinates.push([
                sector.origin.lat,
                sector.origin.lon
            ]);

            allCoordinates.push([
                sector.destination.lat,
                sector.destination.lon
            ]);
        }
    );

    /*
     * Create one marker for every unique airport.
     */
    const airportsByCode = {};

    itinerary.forEach(
        sector => {

            airportsByCode[
                sector.origin.iata
            ] = sector.origin;

            airportsByCode[
                sector.destination.iata
            ] = sector.destination;
        }
    );

    Object.values(
        airportsByCode
    )
    .forEach(airport => {

        const marker =
            L.marker(
                [
                    airport.lat,
                    airport.lon
                ],
                {
                    icon:
                        L.divIcon({
                            className: "",

                            html:
                                '<div class="route-airport-marker">' +
                                airport.iata +
                                '</div>',

                            iconAnchor:
                                [20, 10]
                        })
                }
            )
            .addTo(map);

        routeLayers.push(
            marker
        );
    });

    if (allCoordinates.length > 0) {

        map.fitBounds(
            L.latLngBounds(
                allCoordinates
            ),
            {
                padding: [40, 40]
            }
        );
    }

    document
        .getElementById(
            "mapEmpty"
        )
        .classList
        .add(
            "hidden"
        );
} 

/**
 * Calculates a point at a fractional position along the great-circle path between two coordinates.
 *
 * @param {number} lat1 - Start latitude.
 * @param {number} lon1 - Start longitude.
 * @param {number} lat2 - End latitude.
 * @param {number} lon2 - End longitude.
 * @param {number} f - Fraction from 0 to 1 along the path.
 * @returns {number[]}
 */

function interpolateGreatCircle(lat1, lon1, lat2, lon2, f) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2
  ));
  if (d === 0) return [lat1, lon1];
  const A = Math.sin((1-f)*d) / Math.sin(d);
  const B = Math.sin(f*d)     / Math.sin(d);
  const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
  const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
  const z = A*Math.sin(φ1)              + B*Math.sin(φ2);
  return [toDeg(Math.atan2(z, Math.sqrt(x*x+y*y))), toDeg(Math.atan2(y, x))];
}

/**
 * Splits a coordinate sequence when longitude jumps across the antimeridian, preventing a line across the map.
 *
 * @param {number[][]} points - Latitude/longitude points in route order.
 * @returns {number[][][]}
 */

function splitAtAntimeridian(points) {
  const segments = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const dLon = Math.abs(points[i][1] - points[i-1][1]);
    if (dLon > 180) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  segments.push(current);
  return segments;
}

// ═══════════════════════════════════════════════════════════
//  9. DISTANCE CALCULATION
// ═══════════════════════════════════════════════════════════

/**
 * Calculates great-circle distance between coordinates in nautical miles using the haversine formula.
 *
 * @param {number} lat1 - Start latitude.
 * @param {number} lon1 - Start longitude.
 * @param {number} lat2 - End latitude.
 * @param {number} lon2 - End longitude.
 * @returns {number}
 */

function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;   // Earth radius in nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}



// ═══════════════════════════════════════════════════════════
//  10. GENERAL UI HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Synchronises route-dependent controls and summary values after primary airport or passenger changes.
 */

function updateUI() {
  const ready = origAirport && destAirport;
  document.getElementById('findBtn').disabled  = !ready;
  document.getElementById('trackBtn').disabled = !ready;

  if (ready) {

    buildItinerary();
    
    const distNm = haversineNm(origAirport.lat, origAirport.lon, destAirport.lat, destAirport.lon);
    const distKm = distNm * 1.852;

    // Show route summary
    const summary = document.getElementById('routeSummary');
    summary.style.display = 'block';
    document.getElementById('summaryDist').textContent = Math.round(distNm).toLocaleString();
    document.getElementById('summaryKm').textContent   = Math.round(distKm).toLocaleString();
    document.getElementById('summaryRwy').textContent  = '—';  // updated after matching

//    plotRoute(origAirport, destAirport);
  } 
}

/**
 * Recalculates and rerenders aircraft matches only when the results panel is already visible.
 */

function rerunIfResultsVisible() {
  const area = document.getElementById('resultsArea');
  if (area.style.display !== 'none' && origAirport && destAirport && acLoaded) {
    activeFilter = 'all';
    const matchData = matchAircraft(origAirport, destAirport);
    if (matchData.limitingRwy) {
      document.getElementById('summaryRwy').textContent =
        matchData.limitingRwy.toLocaleString();
    }
    renderResults(matchData);
  }
}

// ═══════════════════════════════════════════════════════════
//  11. EVENT HANDLERS
//  DOM listeners below translate user actions into state changes and call the
//  smallest relevant refresh function. They are registered before loadData().
// ═══════════════════════════════════════════════════════════

document.getElementById('origInput').addEventListener('input', function() {
  lookupAirport(this.value, document.getElementById('origInfo'), true);
});
document.getElementById('destInput').addEventListener('input', function() {
  lookupAirport(this.value, document.getElementById('destInfo'), false);
});

document.getElementById('addSectorBtn').addEventListener('click', addSector);


// Re-run the aircraft search automatically if results are already showing

 // Scroll results into view on mobile
  document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
});


// ═══════════════════════════════════════════════════════════
//  12. APPLICATION STARTUP
// ═══════════════════════════════════════════════════════════

// Start loading data after all functions and event handlers are defined.
loadData();

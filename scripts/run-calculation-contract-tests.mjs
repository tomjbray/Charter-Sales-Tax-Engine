import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    calculate
} from "../calculation-engine.js";


/* ============================================================
   FILE LOCATIONS
   ============================================================ */

const __filename =
    fileURLToPath(
        import.meta.url
    );

const __dirname =
    path.dirname(
        __filename
    );

const rootDir =
    path.resolve(
        __dirname,
        ".."
    );


/* ============================================================
   JSON LOADING
   ============================================================ */

function loadJson(fileName) {
    const filePath =
        path.join(
            rootDir,
            fileName
        );

    if (
        !fs.existsSync(
            filePath
        )
    ) {
        throw new Error(
            `Required test file was not found: ${fileName}`
        );
    }

    try {
        return JSON.parse(
            fs.readFileSync(
                filePath,
                "utf8"
            )
        );
    } catch (error) {
        throw new Error(
            `Could not parse ${fileName}: ${error.message}`
        );
    }
}


const airports =
    loadJson(
        "airports.json"
    );

const countries =
    loadJson(
        "countries.json"
    );

const sellingEntities =
    loadJson(
        "selling_entities.json"
    );

const taxTerritories =
    loadJson(
        "tax_territories.json"
    );

const vatRules =
    loadJson(
        "vat_rules.json"
    );

const madApportionment =
    loadJson(
        "mad_apportionment.json"
    );

const contractDocument =
    loadJson(
        "calculation_contract_tests.json"
    );


/* ============================================================
   REFERENCE DATA
   ============================================================ */

const referenceData = {
    countries,
    sellingEntities,
    taxTerritories,
    vatRules,
    madApportionment
};


/* ============================================================
   ASSERTION HELPERS
   ============================================================ */

function fail(
    testId,
    message
) {
    throw new Error(
        `${testId}: ${message}`
    );
}


function assertEqual(
    testId,
    label,
    actual,
    expected
) {
    if (actual !== expected) {
        fail(
            testId,
            `${label}: expected ` +
            `${JSON.stringify(expected)}, ` +
            `got ${JSON.stringify(actual)}`
        );
    }
}


function assertClose(
    testId,
    label,
    actual,
    expected,
    tolerance
) {
    if (
        !Number.isFinite(actual) ||
        !Number.isFinite(expected) ||
        Math.abs(
            actual -
            expected
        ) > tolerance
    ) {
        fail(
            testId,
            `${label}: expected ${expected}, ` +
            `got ${actual}, ` +
            `tolerance ${tolerance}`
        );
    }
}


function assertNullableText(
    testId,
    label,
    actual,
    expected
) {
    const normalisedActual =
        actual === undefined ||
        actual === ""
            ? null
            : actual;

    const normalisedExpected =
        expected === undefined ||
        expected === ""
            ? null
            : expected;

    assertEqual(
        testId,
        label,
        normalisedActual,
        normalisedExpected
    );
}


/* ============================================================
   AIRPORT / ITINERARY CONSTRUCTION
   ============================================================ */

function getAirport(
    testId,
    airportCode
) {
    const code =
        String(
            airportCode || ""
        )
            .trim()
            .toUpperCase();

    const airport =
        airports[code];

    if (!airport) {
        fail(
            testId,
            `Airport "${code}" was not found in airports.json.`
        );
    }

    const country =
        String(
            airport.country || ""
        )
            .trim()
            .toUpperCase();

    const lat =
        Number(
            airport.lat
        );

    const lon =
        Number(
            airport.lon
        );

    if (!country) {
        fail(
            testId,
            `Airport "${code}" has no country.`
        );
    }

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {
        fail(
            testId,
            `Airport "${code}" has invalid coordinates.`
        );
    }

    return {
        ...airport,
        iata: code,
        country,
        lat,
        lon
    };
}


function buildSectorItinerary(
    testId,
    airportCodes
) {
    if (
        !Array.isArray(
            airportCodes
        ) ||
        airportCodes.length < 2
    ) {
        fail(
            testId,
            "Contract itinerary must contain at least two airports."
        );
    }

    const itinerary = [];

    for (
        let index = 0;
        index <
            airportCodes.length - 1;
        index++
    ) {
        itinerary.push({
            sectorNumber:
                index + 1,

            origin:
                getAirport(
                    testId,
                    airportCodes[index]
                ),

            destination:
                getAirport(
                    testId,
                    airportCodes[
                        index + 1
                    ]
                )
        });
    }

    return itinerary;
}


/* ============================================================
   ENGINE REQUEST
   ============================================================ */

function buildRequest(
    test
) {
    const source =
        test.request;

    return {
        sellingEntity:
            source.sellingEntity,

        charterType:
            source.charterType,

        customerType:
            source.customerType,

        customerCountry:
            source.customerCountry,

        vatRegistered:
            source.vatRegistered,

        charterValue:
            source.charterValue,

        currency:
            source.currency,

        transactionDate:
            source.transactionDate,

        dynamicInputs: {
            ...source.dynamicInputs
        },

        itinerary:
            buildSectorItinerary(
                test.testId,
                source.itinerary
            )
    };
}


/* ============================================================
   EXPECTED DERIVED INPUTS
   ============================================================ */

function compareDerivedInputs(
    test,
    result
) {
    const testId =
        test.testId;

    const expected =
        test.request
            .expectedDerivedInputs ||
        {};

    const actual =
        result.context
            ?.derivedInputs ||
        {};

    Object.entries(
        expected
    ).forEach(
        (
            [
                propertyName,
                expectedValue
            ]
        ) => {
            assertEqual(
                testId,
                `derived input ${propertyName}`,
                actual[propertyName],
                expectedValue
            );
        }
    );
}


/* ============================================================
   SUMMARY COMPARISON
   ============================================================ */

function compareSummary(
    test,
    result
) {
    const testId =
        test.testId;

    const expected =
        test.expected;

    const actual =
        result.summary;

    const tolerance =
        expected.tolerances;

    assertEqual(
        testId,
        "overall status",
        actual.calculationStatus,
        expected.status
    );

    /*
     * The calculation engine retains full Haversine precision because
     * allocation depends on it. The approved B1 contract records the
     * whole-nautical-mile value displayed by the current browser.
     */
    assertClose(
        testId,
        "total distance",
        Math.round(actual.totalDistanceNm),
        expected.totalDistanceNm,
        tolerance.distanceNm
    );

    assertClose(
        testId,
        "total net value",
        actual.totalNetValue,
        expected.totalNetValue,
        tolerance.money
    );

    assertClose(
        testId,
        "total taxable value",
        actual.totalTaxableValue,
        expected.totalTaxableValue,
        tolerance.money
    );

    assertClose(
        testId,
        "total non-taxable value",
        actual.totalNonTaxableValue,
        expected.totalNonTaxableValue,
        tolerance.money
    );

    assertClose(
        testId,
        "total tax amount",
        actual.totalTaxAmount,
        expected.totalTaxAmount,
        tolerance.money
    );

    assertClose(
        testId,
        "total gross value",
        actual.totalGrossValue,
        expected.totalGrossValue,
        tolerance.money
    );

    assertEqual(
        testId,
        "review sector count",
        actual.reviewSectorCount,
        expected.reviewSectorCount
    );
}


/* ============================================================
   APPORTIONMENT COMPARISON
   ============================================================ */

function compareApportionment(
    testId,
    sectorNumber,
    actual,
    expected,
    percentageTolerance
) {
    const prefix =
        `sector ${sectorNumber} apportionment`;

    if (expected === null) {
        assertEqual(
            testId,
            prefix,
            actual,
            null
        );

        return;
    }

    if (!actual) {
        fail(
            testId,
            `${prefix}: expected an apportionment result but got null.`
        );
    }

    /*
     * Production apportionment records contain additional metadata.
     * The contract asserts only the controlled calculation fields.
     */
    assertEqual(
        testId,
        `${prefix} origin`,
        actual.origin,
        expected.origin
    );

    assertEqual(
        testId,
        `${prefix} destination`,
        actual.destination,
        expected.destination
    );

    assertClose(
        testId,
        `${prefix} taxablePercent`,
        Number(
            actual.taxablePercent
        ),
        expected.taxablePercent,
        percentageTolerance
    );

    assertClose(
        testId,
        `${prefix} nonTaxablePercent`,
        Number(
            actual.nonTaxablePercent
        ),
        expected.nonTaxablePercent,
        percentageTolerance
    );
}


/* ============================================================
   COMPONENT COMPARISON
   ============================================================ */

function compareComponents(
    testId,
    sectorNumber,
    actualComponents,
    expected,
    moneyTolerance
) {
    const prefix =
        `sector ${sectorNumber} components`;

    if (
        !Array.isArray(
            actualComponents
        )
    ) {
        fail(
            testId,
            `${prefix}: result is not an array.`
        );
    }

    assertEqual(
        testId,
        `${prefix} count`,
        actualComponents.length,
        expected.count
    );

    const taxableComponent =
        actualComponents.find(
            component =>
                component
                    .componentType ===
                "TAXABLE"
        ) || null;

    const nonTaxableComponent =
        actualComponents.find(
            component =>
                component
                    .componentType ===
                "NON_TAXABLE"
        ) || null;

    const actualTaxableValue =
        taxableComponent
            ? Number(
                taxableComponent.netAmount
            )
            : 0;

    const actualTaxableTax =
        taxableComponent
            ? Number(
                taxableComponent.vatAmount
            )
            : 0;

    const actualNonTaxableValue =
        nonTaxableComponent
            ? Number(
                nonTaxableComponent.netAmount
            )
            : 0;

    const actualNonTaxableTax =
        nonTaxableComponent
            ? Number(
                nonTaxableComponent.vatAmount
            )
            : 0;

    assertClose(
        testId,
        `${prefix} taxable value`,
        actualTaxableValue,
        expected.taxableValue,
        moneyTolerance
    );

    assertClose(
        testId,
        `${prefix} taxable tax`,
        actualTaxableTax,
        expected.taxableTax,
        moneyTolerance
    );

    assertClose(
        testId,
        `${prefix} non-taxable value`,
        actualNonTaxableValue,
        expected.nonTaxableValue,
        moneyTolerance
    );

    assertClose(
        testId,
        `${prefix} non-taxable tax`,
        actualNonTaxableTax,
        expected.nonTaxableTax,
        moneyTolerance
    );
}


/* ============================================================
   SECTOR COMPARISON
   ============================================================ */

function compareSector(
    test,
    actual,
    expected
) {
    const testId =
        test.testId;

    const sectorNumber =
        expected.sectorNumber;

    const prefix =
        `sector ${sectorNumber}`;

    const tolerance =
        test.expected
            .tolerances;

    assertEqual(
        testId,
        `${prefix} number`,
        actual.sector
            .sectorNumber,
        sectorNumber
    );

    assertEqual(
        testId,
        `${prefix} origin airport`,
        actual.sector
            .origin
            .iata,
        expected.originAirport
    );

    assertEqual(
        testId,
        `${prefix} destination airport`,
        actual.sector
            .destination
            .iata,
        expected.destinationAirport
    );

    assertEqual(
        testId,
        `${prefix} origin country`,
        actual.sector
            .origin
            .country,
        expected.originCountry
    );

    assertEqual(
        testId,
        `${prefix} destination country`,
        actual.sector
            .destination
            .country,
        expected.destinationCountry
    );

    assertEqual(
        testId,
        `${prefix} origin territory`,
        actual.transaction
            .originTerritory,
        expected.originTaxTerritory
    );

    assertEqual(
        testId,
        `${prefix} destination territory`,
        actual.transaction
            .destinationTerritory,
        expected.destinationTaxTerritory
    );

    assertEqual(
        testId,
        `${prefix} customer rule region`,
        actual.transaction
            .customerLocation,
        expected.ruleRegion
    );

    assertEqual(
        testId,
        `${prefix} rule ID`,
        actual.matchedRule
            ?.ruleId ||
            null,
        expected.ruleId
    );

    assertEqual(
        testId,
        `${prefix} rule priority`,
        Number(
            actual.matchedRule
                ?.rulePriority
        ),
        expected.rulePriority
    );

    assertEqual(
        testId,
        `${prefix} treatment`,
        actual.matchedRule
            ?.treatment ||
            null,
        expected.treatment
    );

    assertEqual(
        testId,
        `${prefix} calculation method`,
        actual.matchedRule
            ?.calculationMethod ||
            null,
        expected.calculationMethod
    );

    assertEqual(
        testId,
        `${prefix} tax name`,
        actual.taxName,
        expected.taxName
    );

    assertClose(
        testId,
        `${prefix} tax rate`,
        Number(
            actual.matchedRule
                ?.rate
        ),
        expected.taxRate,
        tolerance.percentage
    );

    assertEqual(
        testId,
        `${prefix} status`,
        actual.calculationStatus,
        expected.status
    );

    const actualReviewReason =
        actual.reviewReasons
            ?.length
            ? actual.reviewReasons.join(
                " | "
            )
            : null;

    assertNullableText(
        testId,
        `${prefix} review reason`,
        actualReviewReason,
        expected.reviewReason
    );

    /*
     * Compare the whole-NM browser display value while leaving the
     * engine's full-precision distance unchanged for allocation.
     */
    assertClose(
        testId,
        `${prefix} distance`,
        Math.round(actual.distanceNm),
        expected.distanceNm,
        tolerance.distanceNm
    );

    /*
     * calculation-engine.js retains the browser's internal percentage
     * representation: 34.46 rather than 0.3446.
     *
     * The controlled JSON contract stores decimal fractions.
     */
    assertClose(
        testId,
        `${prefix} allocation percentage`,
        actual.distancePercentage /
            100,
        expected.allocationPercent,
        tolerance.percentage
    );

    assertClose(
        testId,
        `${prefix} allocated net value`,
        actual.allocatedNetValue,
        expected.allocatedNetValue,
        tolerance.money
    );

    assertClose(
        testId,
        `${prefix} taxable percentage`,
        actual.taxablePercent,
        expected.taxablePercent,
        tolerance.percentage
    );

    assertClose(
        testId,
        `${prefix} non-taxable percentage`,
        actual.nonTaxablePercent,
        expected.nonTaxablePercent,
        tolerance.percentage
    );

    assertClose(
        testId,
        `${prefix} taxable value`,
        actual.taxableValue,
        expected.taxableValue,
        tolerance.money
    );

    assertClose(
        testId,
        `${prefix} non-taxable value`,
        actual.nonTaxableValue,
        expected.nonTaxableValue,
        tolerance.money
    );

    assertClose(
        testId,
        `${prefix} tax amount`,
        actual.vatAmount,
        expected.taxAmount,
        tolerance.money
    );

    assertClose(
        testId,
        `${prefix} gross value`,
        actual.grossValue,
        expected.grossValue,
        tolerance.money
    );

    compareApportionment(
        testId,
        sectorNumber,
        actual.madApportionment,
        expected.apportionment,
        tolerance.percentage
    );

    compareComponents(
        testId,
        sectorNumber,
        actual.taxComponents,
        expected.components,
        tolerance.money
    );
}


/* ============================================================
   COMPLETE CONTRACT COMPARISON
   ============================================================ */

function compareContract(
    test,
    result
) {
    const testId =
        test.testId;

    compareDerivedInputs(
        test,
        result
    );

    compareSummary(
        test,
        result
    );

    assertEqual(
        testId,
        "sector count",
        result.sectors.length,
        test.expected
            .sectors.length
    );

    for (
        let index = 0;
        index <
            test.expected
                .sectors.length;
        index++
    ) {
        compareSector(
            test,
            result.sectors[index],
            test.expected
                .sectors[index]
        );
    }
}


/* ============================================================
   TEST EXECUTION
   ============================================================ */

if (
    !Array.isArray(
        contractDocument.tests
    )
) {
    throw new Error(
        "calculation_contract_tests.json does not contain a tests array."
    );
}


const tests =
    contractDocument.tests.filter(
        test =>
            test.enabled !== false &&
            String(
                test.approval
                    ?.status ||
                ""
            )
                .trim()
                .toUpperCase() ===
            "APPROVED"
    );


if (tests.length === 0) {
    throw new Error(
        "No enabled, approved calculation contract tests were found."
    );
}


let passed = 0;
let failed = 0;


console.log(
    `Running ${tests.length} calculation contract tests...`
);


for (const test of tests) {
    try {
        const request =
            buildRequest(
                test
            );

        const result =
            calculate(
                request,
                referenceData
            );

        compareContract(
            test,
            result
        );

        passed++;

        console.log(
            `PASS ${test.testId} - ${test.description}`
        );
    } catch (error) {
        failed++;

        console.error(
            `FAIL ${test.testId} - ${test.description}`
        );

        console.error(
            `  ${error.message}`
        );
    }
}


console.log("");
console.log(
    `Calculation contract tests: ` +
    `${passed} passed, ${failed} failed.`
);


if (failed > 0) {
    process.exitCode = 1;
} else {
    console.log(
        "All calculation contract tests passed."
    );
}

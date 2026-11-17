import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    calculate
} from "../src/calculation-engine.js";


/* ============================================================
   FILE LOADING
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

const testFilePath =
    path.join(
        rootDir,
        "effective_date_calculation_tests.json"
    );

if (
    !fs.existsSync(
        testFilePath
    )
) {
    throw new Error(
        "effective_date_calculation_tests.json was not found."
    );
}

const testDocument =
    JSON.parse(
        fs.readFileSync(
            testFilePath,
            "utf8"
        )
    );

if (
    !Array.isArray(
        testDocument.tests
    )
) {
    throw new Error(
        "effective_date_calculation_tests.json does not contain a tests array."
    );
}


/* ============================================================
   SYNTHETIC REFERENCE DATA
   ============================================================ */

/*
 * These records deliberately contain only the data required by
 * calculation-engine.js.
 *
 * The exercise here is not jurisdiction behaviour. It is proving:
 *
 * request.transactionDate
 *      ->
 * calculation-engine.js
 *      ->
 * sector transaction
 *      ->
 * tax-engine.js
 *      ->
 * effective-date rule selection.
 */

const countries = {
    schemaVersion: "1.0",
    data: {
        XX: {
            code: "XX",
            euMember: false
        }
    }
};


const sellingEntities = {
    schemaVersion: "1.0",
    data: {
        TST: {
            entityCode: "TST",
            country: "XX",
            outsideHomeRegion: "NON_XX",
            taxName: "VAT"
        }
    }
};


const taxTerritories = {
    schemaVersion: "1.0",
    data: {
        XX: {
            territoryCode: "XX",
            country: "XX"
        },

        NON_XX: {
            territoryCode: "NON_XX"
        }
    }
};


/*
 * Both dated rules have otherwise identical criteria and priority.
 *
 * Therefore date eligibility alone must determine which one reaches
 * the priority/ambiguity stage.
 *
 * DATED_OLD:
 *     2026-01-01 through 2026-12-31
 *
 * DATED_NEW:
 *     2027-01-01 through 2027-12-31
 *
 * There is deliberately no effective rule for 2028.
 */
const vatRules = {
    schemaVersion: "1.0",

    rules: [
        {
            ruleId: "DATED_OLD",

            entity: "TST",
            charterType: "PASSENGER",
            customerType: "PRIVATE",
            customerLocation: "XX",
            vatRegistered: "NO",
            originTerritory: "XX",
            destinationTerritory: "XX",

            treatment: "STANDARD",

            rate: 0.1,

            rulePriority: 300,

            ruleExplanation:
                "Synthetic predecessor rule.",

            legalReference: null,

            taxablePercent: 1,

            calculationMethod:
                "STANDARD",

            ruleComponents: null,

            effectiveFrom:
                "2026-01-01",

            effectiveTo:
                "2026-12-31"
        },

        {
            ruleId: "DATED_NEW",

            entity: "TST",
            charterType: "PASSENGER",
            customerType: "PRIVATE",
            customerLocation: "XX",
            vatRegistered: "NO",
            originTerritory: "XX",
            destinationTerritory: "XX",

            treatment: "STANDARD",

            rate: 0.2,

            rulePriority: 300,

            ruleExplanation:
                "Synthetic successor rule.",

            legalReference: null,

            taxablePercent: 1,

            calculationMethod:
                "STANDARD",

            ruleComponents: null,

            effectiveFrom:
                "2027-01-01",

            effectiveTo:
                "2027-12-31"
        }
    ]
};


const madApportionment = {
    schemaVersion: "1.0",
    routes: [],
    routesByPair: {}
};


const referenceData = {
    countries,
    sellingEntities,
    taxTerritories,
    vatRules,
    madApportionment
};


/* ============================================================
   SYNTHETIC ITINERARY
   ============================================================ */

/*
 * One domestic sector keeps allocation at 100%.
 *
 * The coordinates are different so distance calculation also remains
 * valid, but distance itself is not an assertion in these tests.
 */

function buildItinerary() {
    return [
        {
            sectorNumber: 1,

            origin: {
                iata: "AAA",
                country: "XX",
                lat: 50,
                lon: 0
            },

            destination: {
                iata: "BBB",
                country: "XX",
                lat: 51,
                lon: 1
            }
        }
    ];
}


/* ============================================================
   REQUEST
   ============================================================ */

function buildRequest(
    transactionDate
) {
    return {
        sellingEntity: "TST",
        charterType: "PASSENGER",
        customerType: "PRIVATE",
        customerCountry: "XX",
        vatRegistered: "NO",

        charterValue: 10000,

        currency: "GBP",

        transactionDate,

        dynamicInputs: {},

        itinerary:
            buildItinerary()
    };
}


/* ============================================================
   ASSERTIONS
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
    tolerance = 0.01
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
            `got ${actual}.`
        );
    }
}


/* ============================================================
   TEST EXECUTION
   ============================================================ */

let passed = 0;
let failed = 0;


console.log(
    `Running ${testDocument.tests.length} ` +
    `effective-date calculation tests...`
);


for (
    const test of testDocument.tests
) {
    try {
        const request =
            buildRequest(
                test.transactionDate
            );

        const result =
            calculate(
                request,
                referenceData
            );

        /*
         * First prove the request date actually survived
         * calculation-engine.js normalisation.
         */
        assertEqual(
            test.testId,
            "request transactionDate",
            result.request.transactionDate,
            test.transactionDate
        );


        /*
         * Then prove it reached the rule-matching transaction.
         */
        assertEqual(
            test.testId,
            "sector transactionDate",
            result.sectors[0]
                .transaction
                .transactionDate,
            test.transactionDate
        );


        const matchedRule =
            result.sectors[0]
                .matchedRule;


        const actualRuleId =
            matchedRule
                ?.ruleId ||
            null;


        assertEqual(
            test.testId,
            "matched rule",
            actualRuleId,
            test.expected.ruleId
        );


        assertEqual(
            test.testId,
            "calculation status",
            result.summary
                .calculationStatus,
            test.expected
                .calculationStatus
        );


        if (
            test.expected.ruleId ===
            null
        ) {
            /*
             * No rule should mean that the sector cannot calculate.
             */
            assertEqual(
                test.testId,
                "sector status",
                result.sectors[0]
                    .calculationStatus,
                "Review Required"
            );


            assertEqual(
                test.testId,
                "tax amount",
                result.sectors[0]
                    .vatAmount,
                null
            );


            assertEqual(
                test.testId,
                "gross value",
                result.sectors[0]
                    .grossValue,
                null
            );


            const hasNoMatchReason =
                result.sectors[0]
                    .reviewReasons
                    .some(
                        reason =>
                            String(reason)
                                .toLowerCase()
                                .includes(
                                    "no matching"
                                )
                    );


            if (!hasNoMatchReason) {
                fail(
                    test.testId,
                    "No effective rule did not produce the standard no-match review reason."
                );
            }
        } else {
            assertClose(
                test.testId,
                "tax rate",
                Number(
                    matchedRule.rate
                ),
                test.expected.rate,
                0.0000001
            );


            assertClose(
                test.testId,
                "tax amount",
                result.sectors[0]
                    .vatAmount,
                test.expected
                    .taxAmount
            );


            assertClose(
                test.testId,
                "gross value",
                result.sectors[0]
                    .grossValue,
                test.expected
                    .grossValue
            );
        }


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
    `Effective-date calculation tests: ` +
    `${passed} passed, ${failed} failed.`
);


if (failed > 0) {
    process.exitCode = 1;
} else {
    console.log(
        "All effective-date calculation tests passed."
    );
}

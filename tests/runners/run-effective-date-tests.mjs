import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    findMatchingRule,
    evaluateVatCalculationStatus
} from "../../src/tax-engine.js";


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
        "effective_date_tests.json"
    );

if (
    !fs.existsSync(
        testFilePath
    )
) {
    throw new Error(
        "effective_date_tests.json was not found in the repository root."
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
        "effective_date_tests.json does not contain a tests array."
    );
}


/* ============================================================
   SYNTHETIC BASE TRANSACTION
   ============================================================ */

/*
 * Every effective-date test deliberately uses the same ordinary
 * transaction criteria.
 *
 * The only matcher variable under test is transactionDate.
 */
const baseTransaction = {
    entity: "TEST",
    charterType: "PASSENGER",
    customerType: "PRIVATE",
    customerLocation: "TEST",
    vatRegistered: "NO",
    originTerritory: "TEST",
    destinationTerritory: "TEST",
    dynamicInputs: {},
    derivedInputs: {}
};


/* ============================================================
   SYNTHETIC RULE CONSTRUCTION
   ============================================================ */

function buildRule(
    sourceRule
) {
    return {
        ruleId:
            sourceRule.ruleId,

        entity:
            "TEST",

        charterType:
            "PASSENGER",

        customerType:
            "PRIVATE",

        customerLocation:
            "TEST",

        vatRegistered:
            "NO",

        originTerritory:
            "TEST",

        destinationTerritory:
            "TEST",

        treatment:
            "STANDARD",

        rate:
            0.2,

        rulePriority:
            300,

        ruleExplanation:
            "Synthetic effective-date regression rule.",

        legalReference:
            null,

        taxablePercent:
            1,

        calculationMethod:
            "STANDARD",

        ruleComponents:
            null,

        effectiveFrom:
            sourceRule.effectiveFrom,

        effectiveTo:
            sourceRule.effectiveTo
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


function assertContains(
    testId,
    label,
    actual,
    expectedText
) {
    if (
        typeof actual !== "string" ||
        !actual.includes(
            expectedText
        )
    ) {
        fail(
            testId,
            `${label}: expected text containing ` +
            `${JSON.stringify(expectedText)}, ` +
            `got ${JSON.stringify(actual)}`
        );
    }
}


/* ============================================================
   TEST EXECUTION
   ============================================================ */

const tests =
    testDocument.tests;

let passed = 0;
let failed = 0;


console.log(
    `Running ${tests.length} effective-date tests...`
);


for (const test of tests) {
    try {
        const transaction = {
            ...baseTransaction,

            transactionDate:
                test.transactionDate
        };

        const rules =
            test.rules.map(
                buildRule
            );

        const {
            matchedRule,
            matchError
        } = findMatchingRule(
            transaction,
            rules
        );

        const calculationCheck =
            evaluateVatCalculationStatus(
                matchedRule,
                matchError
            );

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


        if (
            test.expected
                .matchErrorContains
        ) {
            assertContains(
                test.testId,
                "match error",
                matchError,
                test.expected
                    .matchErrorContains
            );
        } else {
            assertEqual(
                test.testId,
                "match error",
                matchError,
                test.expected.matchError
            );
        }


        const actualCalculationStatus =
            calculationCheck
                .canCalculate
                ? "Complete"
                : "Review Required";

        assertEqual(
            test.testId,
            "calculation status",
            actualCalculationStatus,
            test.expected
                .calculationStatus
        );


        /*
         * For deliberate no-match tests, verify that the existing
         * calculation-status layer continues to supply the standard
         * review reason.
         */
        if (
            test.expected.ruleId ===
                null &&
            !test.expected
                .matchErrorContains
        ) {
            const hasNoMatchReason =
                calculationCheck
                    .reasons
                    .some(
                        reason =>
                            String(
                                reason
                            )
                                .toLowerCase()
                                .includes(
                                    "no matching"
                                )
                    );

            if (!hasNoMatchReason) {
                fail(
                    test.testId,
                    "No-match result did not produce the standard review reason."
                );
            }
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
    `Effective-date tests: ` +
    `${passed} passed, ${failed} failed.`
);


if (failed > 0) {
    process.exitCode = 1;
} else {
    console.log(
        "All effective-date tests passed."
    );
}

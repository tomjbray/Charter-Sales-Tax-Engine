import { readFile } from "node:fs/promises";
import { getMadApportionment } from "../mad-apportionment.js";

async function readJson(relativePath) {
    const fileUrl = new URL(relativePath, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
}

function approximatelyEqual(actual, expected, tolerance = 1e-10) {
    return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

const testDocument = await readJson("../apportionment_tests.json");
const madApportionmentData = await readJson("../mad_apportionment.json");

if (!Array.isArray(testDocument.tests)) {
    throw new Error("apportionment_tests.json does not contain a tests array.");
}

const results = testDocument.tests.map(test => {
    const actual = getMadApportionment(
        test.origin,
        test.destination,
        madApportionmentData
    );

    if (test.expectedNoMatch === true) {
        return {
            ...test,
            actual,
            passed: actual === null
        };
    }

    const passed =
        actual !== null &&
        actual.origin === test.origin &&
        actual.destination === test.destination &&
        approximatelyEqual(
            actual.taxablePercent,
            test.expectedTaxablePercent
        ) &&
        approximatelyEqual(
            actual.nonTaxablePercent,
            test.expectedNonTaxablePercent
        );

    return {
        ...test,
        actual,
        passed
    };
});

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nMAD apportionment tests");
console.log("=======================");

for (const result of results) {
    if (result.passed) {
        console.log(`PASS ${result.testId} - ${result.description}`);
        continue;
    }

    console.error(`FAIL ${result.testId} - ${result.description}`);

    if (result.expectedNoMatch === true) {
        console.error(
            `  Expected no apportionment, actual ${JSON.stringify(result.actual)}`
        );
        continue;
    }

    console.error(
        `  Taxable percent: expected ${result.expectedTaxablePercent}, actual ${result.actual?.taxablePercent ?? "NO MATCH"}`
    );
    console.error(
        `  Non-taxable percent: expected ${result.expectedNonTaxablePercent}, actual ${result.actual?.nonTaxablePercent ?? "NO MATCH"}`
    );
}

console.log("\nSummary");
console.log(`Enabled: ${results.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log("Skipped: 0");

if (failed.length > 0) {
    process.exitCode = 1;
}

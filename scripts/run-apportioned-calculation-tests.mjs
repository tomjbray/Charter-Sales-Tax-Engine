import { readFile } from "node:fs/promises";
import { getMadApportionment } from "../mad-apportionment.js";

async function readJson(relativePath) {
    const fileUrl = new URL(relativePath, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
}

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function approximatelyEqual(actual, expected, tolerance = 1e-9) {
    return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function calculateApportionedAmounts(netValue, rate, apportionment) {
    if (!apportionment) {
        return null;
    }

    const taxablePercent = Number(apportionment.taxablePercent);
    const nonTaxablePercent = Number(apportionment.nonTaxablePercent);
    const taxableValue = roundMoney(netValue * taxablePercent);
    const nonTaxableValue = roundMoney(netValue * nonTaxablePercent);
    const vatAmount = roundMoney(taxableValue * Number(rate));
    const grossValue = roundMoney(Number(netValue) + vatAmount);

    return {
        taxablePercent,
        nonTaxablePercent,
        taxableValue,
        nonTaxableValue,
        vatAmount,
        grossValue
    };
}

const testDocument = await readJson("../apportioned_calculation_tests.json");
const madApportionmentData = await readJson("../mad_apportionment.json");

const results = testDocument.tests.map(test => {
    const apportionment = getMadApportionment(
        test.origin,
        test.destination,
        madApportionmentData
    );

    const actual = calculateApportionedAmounts(
        test.netValue,
        test.rate,
        apportionment
    );

    const passed = actual !== null &&
        approximatelyEqual(actual.taxablePercent, test.expectedTaxablePercent) &&
        approximatelyEqual(actual.taxableValue, test.expectedTaxableValue) &&
        approximatelyEqual(actual.nonTaxableValue, test.expectedNonTaxableValue) &&
        approximatelyEqual(actual.vatAmount, test.expectedVatAmount) &&
        approximatelyEqual(actual.grossValue, test.expectedGrossValue);

    return { ...test, actual, passed };
});

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nMAD apportioned calculation tests");
console.log("=================================");

for (const result of results) {
    if (result.passed) {
        console.log(`PASS ${result.testId} - ${result.description}`);
        continue;
    }

    console.error(`FAIL ${result.testId} - ${result.description}`);
    console.error(`  Expected taxable: ${result.expectedTaxableValue}; actual: ${result.actual?.taxableValue ?? "NO MATCH"}`);
    console.error(`  Expected non-taxable: ${result.expectedNonTaxableValue}; actual: ${result.actual?.nonTaxableValue ?? "NO MATCH"}`);
    console.error(`  Expected VAT: ${result.expectedVatAmount}; actual: ${result.actual?.vatAmount ?? "NO MATCH"}`);
    console.error(`  Expected gross: ${result.expectedGrossValue}; actual: ${result.actual?.grossValue ?? "NO MATCH"}`);
}

console.log("\nSummary");
console.log(`Enabled: ${results.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log("Skipped: 0");

if (failed.length > 0) {
    process.exitCode = 1;
}

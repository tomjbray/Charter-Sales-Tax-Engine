import { readFile } from "node:fs/promises";
import { executeRuleTest } from "../rule-tests.js";

async function readJson(path) {
    return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

const vatRulesDocument = await readJson("../vat_rules.json");
const ruleTestsDocument = await readJson("../rule_tests.json");

if (!Array.isArray(vatRulesDocument.rules)) {
    throw new Error("vat_rules.json does not contain a rules array.");
}

if (!Array.isArray(ruleTestsDocument.tests)) {
    throw new Error("rule_tests.json does not contain a tests array.");
}

const enabledTests = ruleTestsDocument.tests.filter(test => test.enabled !== false);
const skippedCount = ruleTestsDocument.tests.length - enabledTests.length;
const results = enabledTests.map(test =>
    executeRuleTest(test, vatRulesDocument.rules)
);

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nCharter tax rule regression tests");
console.log("=================================");

for (const result of results) {
    if (result.passed) {
        console.log(`PASS ${result.testId} - ${result.description || ""}`);
        continue;
    }

    console.error(`\nFAIL ${result.testId} - ${result.description || ""}`);
    for (const failure of result.failures) {
        console.error(`  ${failure}`);
    }
}

console.log("\nSummary");
console.log(`Enabled: ${enabledTests.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log(`Skipped: ${skippedCount}`);

if (failed.length > 0) {
    process.exitCode = 1;
}

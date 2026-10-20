import { readFile } from "node:fs/promises";
import { findMatchingRule } from "../tax-engine.js";

async function readJson(relativePath) {
    const fileUrl = new URL(relativePath, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
}

const testDocument = await readJson("../priority_tests.json");

if (!Array.isArray(testDocument.tests)) {
    throw new Error("priority_tests.json does not contain a tests array.");
}

const results = testDocument.tests.map(test => {
    const { matchedRule, matchError } = findMatchingRule(
        test.transaction,
        test.rules
    );

    const actualRuleId = matchedRule?.ruleId ?? null;
    const expectedRuleId = test.expectedRuleId ?? null;
    const expectedError = test.expectedMatchError ?? null;
    const expectedErrorContains = test.expectedMatchErrorContains ?? null;

    const ruleMatches = actualRuleId === expectedRuleId;
    const errorMatches = expectedErrorContains
        ? String(matchError || "").includes(expectedErrorContains)
        : matchError === expectedError;

    return {
        ...test,
        actualRuleId,
        actualMatchError: matchError,
        passed: ruleMatches && errorMatches
    };
});

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nRule priority tests");
console.log("===================");

for (const result of results) {
    if (result.passed) {
        console.log(`PASS ${result.testId} - ${result.description}`);
        continue;
    }

    console.error(`FAIL ${result.testId} - ${result.description}`);
    console.error(`  Rule ID: expected ${result.expectedRuleId ?? "NO MATCH"}, actual ${result.actualRuleId ?? "NO MATCH"}`);
    console.error(`  Match error: ${result.actualMatchError ?? "none"}`);
}

console.log("\nSummary");
console.log(`Enabled: ${results.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log("Skipped: 0");

if (failed.length > 0) {
    process.exitCode = 1;
}

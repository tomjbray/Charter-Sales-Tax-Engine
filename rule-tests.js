import {
    findMatchingRule,
    evaluateVatCalculationStatus
} from "./tax-engine.js";

const NUMBER_TOLERANCE = 0.000001;

function numbersEqual(actual, expected) {
    return (
        Number.isFinite(Number(actual)) &&
        Number.isFinite(Number(expected)) &&
        Math.abs(Number(actual) - Number(expected)) < NUMBER_TOLERANCE
    );
}

function compareRuleTest(test, matchedRule, calculationCheck) {
    const expected = test.expected || {};
    const actual = {
        ruleId: matchedRule?.ruleId ?? null,
        treatment: matchedRule?.treatment ?? null,
        rate: matchedRule?.rate ?? null,
        taxablePercent: matchedRule?.taxablePercent ?? null,
        calculationStatus: calculationCheck.status
    };

    const failures = [];

    if (actual.ruleId !== expected.ruleId) {
        failures.push(`Rule ID: expected ${expected.ruleId}, actual ${actual.ruleId ?? "NO MATCH"}`);
    }
    if (actual.treatment !== expected.treatment) {
        failures.push(`Treatment: expected ${expected.treatment}, actual ${actual.treatment ?? "NO MATCH"}`);
    }
    if (!numbersEqual(actual.rate, expected.rate)) {
        failures.push(`Rate: expected ${expected.rate}, actual ${actual.rate ?? "NO MATCH"}`);
    }
    if (!numbersEqual(actual.taxablePercent, expected.taxablePercent)) {
        failures.push(
            `Taxable percentage: expected ${expected.taxablePercent}, actual ${actual.taxablePercent ?? "NO MATCH"}`
        );
    }
    if (actual.calculationStatus !== expected.calculationStatus) {
        failures.push(
            `Calculation status: expected ${expected.calculationStatus}, actual ${actual.calculationStatus}`
        );
    }

    return {
        testId: test.testId,
        description: test.description,
        passed: failures.length === 0,
        expected,
        actual,
        failures
    };
}

function executeRuleTest(test, rules) {
    const transaction = test.transaction || {};
    const { matchedRule, matchError } = findMatchingRule(transaction, rules);
    const calculationCheck = evaluateVatCalculationStatus(matchedRule, matchError);
    return compareRuleTest(test, matchedRule, calculationCheck);
}

function reportRegressionResults(summary) {
    console.group(
        `Rule regression tests: ${summary.passedCount} passed, ${summary.failedCount} failed, ${summary.skippedCount} skipped`
    );

    summary.results.forEach(result => {
        if (result.passed) {
            console.log(`PASS ${result.testId} — ${result.description || ""}`);
            return;
        }

        console.group(`FAIL ${result.testId} — ${result.description || ""}`);
        result.failures.forEach(failure => console.error(failure));
        console.log("Expected:", result.expected);
        console.log("Actual:", result.actual);
        console.groupEnd();
    });

    if (summary.skippedCount > 0) {
        console.info(`${summary.skippedCount} disabled test(s) skipped.`);
    }

    console.table(
        summary.results.map(result => ({
            TestID: result.testId,
            Result: result.passed ? "PASS" : "FAIL",
            ExpectedRule: result.expected.ruleId,
            ActualRule: result.actual.ruleId,
            Failures: result.failures.length
        }))
    );

    console.groupEnd();
}

async function loadRuleTests(testFileUrl) {
    const response = await fetch(testFileUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`rule_tests.json: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.tests)) {
        throw new Error("rule_tests.json does not contain a tests array.");
    }
    return data;
}

async function runRuleRegressionTests({ rules, testFileUrl = "./rule_tests.json" }) {
    try {
        const testData = await loadRuleTests(testFileUrl);
        const enabledTests = testData.tests.filter(test => test.enabled !== false);
        const skippedCount = testData.tests.length - enabledTests.length;
        const results = enabledTests.map(test => executeRuleTest(test, rules));
        const passedCount = results.filter(result => result.passed).length;
        const failedCount = results.length - passedCount;

        const summary = {
            testCount: testData.tests.length,
            enabledCount: enabledTests.length,
            skippedCount,
            passedCount,
            failedCount,
            results
        };

        reportRegressionResults(summary);
        return summary;
    } catch (error) {
        console.warn("Rule regression tests unavailable.", error);
        return {
            testCount: 0,
            enabledCount: 0,
            skippedCount: 0,
            passedCount: 0,
            failedCount: 0,
            results: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export { loadRuleTests, executeRuleTest, runRuleRegressionTests };

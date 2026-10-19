import { readFile } from "node:fs/promises";
import { getDerivedJourneyInputs } from "../journey-context.js";

async function readJson(relativePath) {
    const fileUrl = new URL(relativePath, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
}

function buildItinerary(countryChain) {
    if (!Array.isArray(countryChain) || countryChain.length < 2) {
        return [];
    }

    return countryChain.slice(0, -1).map((originCountry, index) => ({
        originCountry,
        destinationCountry: countryChain[index + 1]
    }));
}

const testDocument = await readJson("../journey_context_tests.json");

if (!Array.isArray(testDocument.tests)) {
    throw new Error(
        "journey_context_tests.json does not contain a tests array."
    );
}

const enabledTests = testDocument.tests.filter(
    test => test.enabled !== false
);
const skippedCount = testDocument.tests.length - enabledTests.length;

const results = enabledTests.map(test => {
    const itinerary = buildItinerary(test.countryChain);
    const actual = getDerivedJourneyInputs(
        itinerary,
        test.homeCountry
    );
    const expectedValue = String(test.expected?.HomeRoundTrip || "")
        .trim()
        .toUpperCase();
    const actualValue = String(actual.HomeRoundTrip || "")
        .trim()
        .toUpperCase();

    return {
        testId: test.testId,
        description: test.description,
        expected: expectedValue,
        actual: actualValue,
        passed: actualValue === expectedValue
    };
});

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nJourney context tests");
console.log("=====================");

for (const result of results) {
    if (result.passed) {
        console.log(
            `PASS ${result.testId} - ${result.description}`
        );
        continue;
    }

    console.error(
        `FAIL ${result.testId} - ${result.description}`
    );
    console.error(
        `  HomeRoundTrip: expected ${result.expected}, actual ${result.actual}`
    );
}

console.log("\nSummary");
console.log(`Enabled: ${enabledTests.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log(`Skipped: ${skippedCount}`);

if (failed.length > 0) {
    process.exitCode = 1;
}

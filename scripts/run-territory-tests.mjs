import { readFile } from "node:fs/promises";
import { getAirportRuleTerritory } from "../territory-resolution.js";

async function readJson(relativePath) {
    const fileUrl = new URL(relativePath, import.meta.url);
    return JSON.parse(await readFile(fileUrl, "utf8"));
}

const testsDocument = await readJson("../territory_tests.json");
const territories = await readJson("../tax_territories.json");
const countries = await readJson("../countries.json");
const sellingEntities = await readJson("../selling_entities.json");

const results = testsDocument.tests.map(test => {
    const entity = sellingEntities?.data?.[test.entity] || {};
    const outsideHomeRegion = entity.outsideHomeRegion || "";

    const actualOrigin = getAirportRuleTerritory(
        test.origin,
        test.homeCountry,
        territories,
        countries,
        outsideHomeRegion
    );

    const actualDestination = getAirportRuleTerritory(
        test.destination,
        test.homeCountry,
        territories,
        countries,
        outsideHomeRegion
    );

    const passed =
        actualOrigin === test.expectedOriginTerritory &&
        actualDestination === test.expectedDestinationTerritory;

    return {
        ...test,
        actualOrigin,
        actualDestination,
        passed
    };
});

const passed = results.filter(result => result.passed);
const failed = results.filter(result => !result.passed);

console.log("\nTerritory resolution tests");
console.log("==========================");

for (const result of results) {
    if (result.passed) {
        console.log(`PASS ${result.testId} - ${result.description}`);
        continue;
    }

    console.error(`FAIL ${result.testId} - ${result.description}`);
    console.error(`  Origin: expected ${result.expectedOriginTerritory}, actual ${result.actualOrigin}`);
    console.error(`  Destination: expected ${result.expectedDestinationTerritory}, actual ${result.actualDestination}`);
}

console.log("\nSummary");
console.log(`Enabled: ${results.length}`);
console.log(`Passed:  ${passed.length}`);
console.log(`Failed:  ${failed.length}`);
console.log("Skipped: 0");

if (failed.length > 0) {
    process.exitCode = 1;
}

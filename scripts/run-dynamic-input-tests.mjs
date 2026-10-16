import {
    readFile
} from "node:fs/promises";

import {
    getApplicableDynamicInputKeys
} from "../dynamic-inputs.js";

async function readJson(
    relativePath
) {
    const fileUrl =
        new URL(
            relativePath,
            import.meta.url
        );

    const fileText =
        await readFile(
            fileUrl,
            "utf8"
        );

    return JSON.parse(
        fileText
    );
}

function arraysEqual(
    firstValues,
    secondValues
) {
    return (
        firstValues.length ===
            secondValues.length &&
        firstValues.every(
            (
                value,
                index
            ) =>
                value ===
                secondValues[index]
        )
    );
}

const inputRequirementsDocument =
    await readJson(
        "../input_requirements.json"
    );

const sellingEntitiesDocument =
    await readJson(
        "../selling_entities.json"
    );

const testDocument =
    await readJson(
        "../dynamic_input_tests.json"
    );

if (
    !Array.isArray(
        inputRequirementsDocument.inputs
    )
) {
    throw new Error(
        "input_requirements.json does not contain an inputs array."
    );
}

if (
    !sellingEntitiesDocument.data ||
    typeof sellingEntitiesDocument.data !==
        "object"
) {
    throw new Error(
        "selling_entities.json does not contain a data object."
    );
}

if (
    !Array.isArray(
        testDocument.tests
    )
) {
    throw new Error(
        "dynamic_input_tests.json does not contain a tests array."
    );
}

const enabledTests =
    testDocument.tests.filter(
        test =>
            test.enabled !== false
    );

const skippedCount =
    testDocument.tests.length -
    enabledTests.length;

const results =
    enabledTests.map(test => {
        const entityCode =
            String(
                test.context?.entity || ""
            )
                .trim()
                .toUpperCase();

        const entity =
            sellingEntitiesDocument
                .data[entityCode];

        if (!entity) {
            return {
                testId:
                    test.testId,

                description:
                    test.description,

                passed:
                    false,

                expectedInputKeys:
                    test.expectedInputKeys || [],

                actualInputKeys:
                    [],

                failure:
                    `Unknown selling entity ${entityCode}.`
            };
        }

        const expectedInputKeys =
            [
                ...(
                    test.expectedInputKeys ||
                    []
                )
            ].sort();

        const actualInputKeys =
            getApplicableDynamicInputKeys(
                inputRequirementsDocument.inputs,
                {
                    entity:
                        entityCode,

                    entityHomeCountry:
                        entity.country,

                    charterType:
                        test.context
                            ?.charterType
                }
            );

        const passed =
            arraysEqual(
                actualInputKeys,
                expectedInputKeys
            );

        return {
            testId:
                test.testId,

            description:
                test.description,

            passed,

            expectedInputKeys,

            actualInputKeys,

            failure:
                passed
                    ? null
                    : (
                        "Expected [" +
                        expectedInputKeys.join(", ") +
                        "] but received [" +
                        actualInputKeys.join(", ") +
                        "]."
                    )
        };
    });

const passedResults =
    results.filter(
        result =>
            result.passed
    );

const failedResults =
    results.filter(
        result =>
            !result.passed
    );

console.log(
    "\nDynamic input applicability tests"
);

console.log(
    "================================="
);

results.forEach(result => {
    if (result.passed) {
        console.log(
            `PASS ${result.testId} - ` +
            `${result.description || ""}`
        );

        return;
    }

    console.error(
        `\nFAIL ${result.testId} - ` +
        `${result.description || ""}`
    );

    console.error(
        `  ${result.failure}`
    );
});

console.log(
    "\nSummary"
);

console.log(
    `Enabled: ${enabledTests.length}`
);

console.log(
    `Passed:  ${passedResults.length}`
);

console.log(
    `Failed:  ${failedResults.length}`
);

console.log(
    `Skipped: ${skippedCount}`
);

if (
    failedResults.length > 0
) {
    process.exitCode = 1;
}

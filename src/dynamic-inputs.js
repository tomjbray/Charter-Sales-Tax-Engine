/**
 * Returns the supplementary input definitions applicable to a
 * transaction context.
 *
 * appliesToCountry refers to the selling entity's home country,
 * not the customer's country.
 *
 * This function is deliberately independent of the DOM and global
 * application state so it can be used by both app.js and automated
 * regression tests.
 *
 * @param {Object[]} inputDefinitions
 * @param {Object} context
 * @param {string} context.entity
 * @param {string} context.entityHomeCountry
 * @param {string} context.charterType
 * @returns {Object[]}
 */
function getApplicableDynamicInputsForContext(
    inputDefinitions,
    context
) {
    if (!Array.isArray(inputDefinitions)) {
        return [];
    }

    const normalisedEntity =
        normaliseApplicabilityValue(
            context?.entity
        );

    const normalisedHomeCountry =
        normaliseApplicabilityValue(
            context?.entityHomeCountry
        );

    const normalisedCharterType =
        normaliseApplicabilityValue(
            context?.charterType
        );

    return inputDefinitions.filter(input => {
        const appliesToEntity =
            normaliseApplicabilityValue(
                input.appliesToEntity
            );

        const appliesToCountry =
            normaliseApplicabilityValue(
                input.appliesToCountry
            );

        const appliesToCharterType =
            normaliseApplicabilityValue(
                input.appliesToCharterType
            );

        const entityMatch =
            isApplicabilityWildcard(
                appliesToEntity
            ) ||
            appliesToEntity ===
                normalisedEntity;

        const countryMatch =
            isApplicabilityWildcard(
                appliesToCountry
            ) ||
            appliesToCountry ===
                normalisedHomeCountry;

        const charterMatch =
            isApplicabilityWildcard(
                appliesToCharterType
            ) ||
            appliesToCharterType ===
                normalisedCharterType;

        return (
            entityMatch &&
            countryMatch &&
            charterMatch
        );
    });
}

/**
 * Returns the applicable dynamic input keys for a context.
 *
 * This compact form is particularly useful for regression tests.
 *
 * @param {Object[]} inputDefinitions
 * @param {Object} context
 * @returns {string[]}
 */
function getApplicableDynamicInputKeys(
    inputDefinitions,
    context
) {
    return getApplicableDynamicInputsForContext(
        inputDefinitions,
        context
    )
        .map(input =>
            String(input.inputKey || "").trim()
        )
        .filter(Boolean)
        .sort();
}

function normaliseApplicabilityValue(
    value
) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function isApplicabilityWildcard(
    value
) {
    return (
        value === "" ||
        value === "ANY"
    );
}

export {
    getApplicableDynamicInputsForContext,
    getApplicableDynamicInputKeys
};

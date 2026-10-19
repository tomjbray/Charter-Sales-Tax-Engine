// Charter Sales Tax Engine — pure tax-rule engine.

function valueMatches(
    ruleValue,
    inputValue
) {

    if (
        !ruleValue ||
        ruleValue === "ANY"
    ) {
        return true;
    }

    return ruleValue === inputValue;
}

/**
 * Filters the VAT rule matrix against all transaction dimensions and returns the first matching rule.
 *
 * @param {Object} transaction - Normalised VAT transaction for one itinerary sector.
 * @returns {Object|null}
 */

function dynamicInputsMatch(
    rule,
    transaction
) {

    const dynamicInputs =
        transaction.dynamicInputs || {};

    for (
        const [inputKey, inputValue]
        of Object.entries(dynamicInputs)
    ) {

        const ruleValue =
            rule[inputKey];

        if (
            ruleValue === undefined ||
            ruleValue === null ||
            ruleValue === "" ||
            ruleValue === "ANY"
        ) {
            continue;
        }

        const transactionValue =
            String(inputValue)
                .toUpperCase();

        const normalisedRuleValue =
            String(ruleValue)
                .toUpperCase();

        const expectedValue =
            transactionValue === "TRUE"
                ? "YES"
                : transactionValue === "FALSE"
                    ? "NO"
                    : transactionValue;

        if (
            normalisedRuleValue !==
            expectedValue
        ) {
            return false;
        }

    }

    return true;

}

/**
 * Tests automatically derived journey inputs against corresponding
 * properties in a VAT rule.
 *
 * The function is generic and does not contain knowledge of
 * HomeRoundTrip or any particular jurisdiction.
 *
 * @param {Object} rule
 * @param {Object} transaction
 * @returns {boolean}
 */
function derivedInputsMatch(
    rule,
    transaction
) {
    const derivedInputs =
        transaction?.derivedInputs || {};

    return Object.entries(
        derivedInputs
    ).every(
        ([inputKey, inputValue]) =>
            valueMatches(
                rule[inputKey],
                inputValue
            )
    );
}


function findMatchingRule(transaction, rules) {
    if (!Array.isArray(rules)) {
        return { matchedRule: null, matchError: "VAT rule data is unavailable." };
    }

    const matches = rules
        .filter(rule =>
            valueMatches(rule.entity, transaction.entity) &&
            valueMatches(rule.charterType, transaction.charterType) &&
            valueMatches(rule.customerType, transaction.customerType) &&
            valueMatches(rule.customerLocation, transaction.customerLocation) &&
            valueMatches(rule.vatRegistered, transaction.vatRegistered) &&
            valueMatches(rule.originTerritory, transaction.originTerritory) &&
            valueMatches(rule.destinationTerritory, transaction.destinationTerritory) &&
            dynamicInputsMatch(
                rule,
                transaction
            ) &&
            derivedInputsMatch(
                rule,
                transaction
            )
        .sort((firstRule, secondRule) =>
            Number(secondRule.rulePriority || 0) - Number(firstRule.rulePriority || 0) ||
            String(firstRule.ruleId || "").localeCompare(String(secondRule.ruleId || ""))
        );

    if (matches.length === 0) return { matchedRule: null, matchError: null };

    const highestPriority = Number(matches[0].rulePriority || 0);
    const topMatches = matches.filter(
        rule => Number(rule.rulePriority || 0) === highestPriority
    );

    if (topMatches.length > 1) {
        return {
            matchedRule: null,
            matchError: `Ambiguous rule match at priority ${highestPriority}: ` +
                topMatches.map(rule => rule.ruleId || "UNNAMED RULE").join(", ") + "."
        };
    }

    return { matchedRule: matches[0], matchError: null };
}

function evaluateVatCalculationStatus(matchedRule, matchError = null) {
    const reasons = [];

    if (matchError) {
        reasons.push(matchError);
    } else if (!matchedRule) {
        reasons.push("No matching VAT rule was found.");
    } else {
        const calculationMethod =
            String(matchedRule.calculationMethod || "")
                .trim()
                .toUpperCase();

        if (!calculationMethod) {
            reasons.push("The rule has no calculation method.");
        } else if (calculationMethod !== "STANDARD") {
            reasons.push(
                `Calculation method ${calculationMethod} is not yet supported.`
            );
        }

        if (
            matchedRule.rate === null ||
            matchedRule.rate === undefined ||
            matchedRule.rate === "" ||
            !Number.isFinite(Number(matchedRule.rate))
        ) {
            reasons.push("The rule has no valid VAT rate.");
        }

        if (
            matchedRule.taxablePercent === null ||
            matchedRule.taxablePercent === undefined ||
            matchedRule.taxablePercent === "" ||
            !Number.isFinite(Number(matchedRule.taxablePercent))
        ) {
            reasons.push("The rule has no valid taxable percentage.");
        }
    }

    return {
        canCalculate: reasons.length === 0,
        status: reasons.length === 0 ? "Complete" : "Review Required",
        reasons
    };
}

export { valueMatches, derivedInputsMatch, dynamicInputsMatch, findMatchingRule, evaluateVatCalculationStatus };

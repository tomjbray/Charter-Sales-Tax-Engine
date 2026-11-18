/**
 * Charter Sales Tax Engine - tax-engine.js
 *
 * Pure, deterministic rule-matching and calculation-readiness helpers.
 * Applies wildcard criteria, dynamic and derived inputs, effective-date
 * eligibility and rule-priority resolution. Equal highest-priority matches
 * are treated as an ambiguity requiring review.
 *
 * This module contains no DOM, network, allocation, territory-resolution or
 * jurisdiction-specific calculation code.
 */

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

/**
 * Determines whether a VAT rule is effective for the transaction date.
 *
 * Behaviour:
 * - Blank transaction date = do not apply date filtering.
 * - Blank EffectiveFrom = no lower date boundary.
 * - Blank EffectiveTo = no upper date boundary.
 * - EffectiveFrom and EffectiveTo are inclusive.
 *
 * Controlled dates use ISO YYYY-MM-DD format, so lexical comparison
 * is equivalent to chronological comparison.
 */
function ruleIsEffectiveOnDate(
    rule,
    transactionDate
) {
    /*
     * A blank transaction date deliberately disables date filtering. This
     * preserves callers that do not yet supply a controlled tax-point date.
     */
    if (
        transactionDate === null ||
        transactionDate === undefined ||
        String(transactionDate).trim() === ""
    ) {
        return true;
    }

    const date =
        String(transactionDate)
            .trim();

    const effectiveFrom =
        rule.effectiveFrom === null ||
        rule.effectiveFrom === undefined
            ? ""
            : String(
                rule.effectiveFrom
            ).trim();

    const effectiveTo =
        rule.effectiveTo === null ||
        rule.effectiveTo === undefined
            ? ""
            : String(
                rule.effectiveTo
            ).trim();

    /*
     * Before the start date.
     */
    if (
        effectiveFrom !== "" &&
        date < effectiveFrom
    ) {
        return false;
    }

    /*
     * After the end date.
     */
    if (
        effectiveTo !== "" &&
        date > effectiveTo
    ) {
        return false;
    }

    return true;
}

function findMatchingRule(transaction, rules) {
    if (!Array.isArray(rules)) {
        return {
            matchedRule: null,
            matchError:
                "VAT rule data is unavailable."
        };
    }

    const matches = rules
        .filter(rule =>
            /*
             * ====================================================
             * EFFECTIVE-DATE ELIGIBILITY
             *
             * Date eligibility is tested before the normal transaction
             * criteria. A blank transactionDate makes every effective-date
             * window eligible.
             * ====================================================
             */
            ruleIsEffectiveOnDate(
                rule,
                transaction.transactionDate
            ) &&

            /*
             * Existing deterministic matching criteria.
             */
            valueMatches(
                rule.entity,
                transaction.entity
            ) &&

            valueMatches(
                rule.charterType,
                transaction.charterType
            ) &&

            valueMatches(
                rule.customerType,
                transaction.customerType
            ) &&

            valueMatches(
                rule.customerLocation,
                transaction.customerLocation
            ) &&

            valueMatches(
                rule.vatRegistered,
                transaction.vatRegistered
            ) &&

            valueMatches(
                rule.originTerritory,
                transaction.originTerritory
            ) &&

            valueMatches(
                rule.destinationTerritory,
                transaction.destinationTerritory
            ) &&

            dynamicInputsMatch(
                rule,
                transaction
            ) &&

            derivedInputsMatch(
                rule,
                transaction
            )
        )
        .sort((firstRule, secondRule) =>
            Number(
                secondRule.rulePriority || 0
            ) -
            Number(
                firstRule.rulePriority || 0
            ) ||

            String(
                firstRule.ruleId || ""
            ).localeCompare(
                String(
                    secondRule.ruleId || ""
                )
            )
        );


    if (matches.length === 0) {
        return {
            matchedRule: null,
            matchError: null
        };
    }


    /*
     * Priority resolution remains unchanged.
     *
     * Effective dating determines which rules are eligible.
     * It does NOT resolve competition between multiple eligible rules.
     */
    const highestPriority =
        Number(
            matches[0].rulePriority || 0
        );

    const topMatches =
        matches.filter(
            rule =>
                Number(
                    rule.rulePriority || 0
                ) ===
                highestPriority
        );


    /*
     * Retain the existing ambiguity protection.
     *
     * This is particularly important for overlapping effective
     * periods. Two same-priority rules that are both effective on
     * the same date remain a configuration error.
     */
    if (topMatches.length > 1) {
        return {
            matchedRule: null,

            matchError:
                `Ambiguous rule match at priority ${highestPriority}: ` +
                topMatches
                    .map(
                        rule =>
                            rule.ruleId ||
                            "UNNAMED RULE"
                    )
                    .join(", ") +
                "."
        };
    }


    return {
        matchedRule:
            matches[0],

        matchError:
            null
    };
}

function evaluateVatCalculationStatus(
    matchedRule,
    matchError = null
) {
    const reasons = [];

    if (matchError) {
        reasons.push(matchError);
    } else if (!matchedRule) {
        reasons.push(
            "No matching VAT rule was found."
        );
    } else {
        const calculationMethod =
            String(
                matchedRule.calculationMethod || ""
            )
                .trim()
                .toUpperCase();

        const supportedCalculationMethods =
            new Set([
                "STANDARD",
                "APPORTIONED"
            ]);

        if (!calculationMethod) {
            reasons.push(
                "The rule has no calculation method."
            );
        } else if (
            !supportedCalculationMethods.has(
                calculationMethod
            )
        ) {
            reasons.push(
                `Calculation method ${calculationMethod} is not yet supported.`
            );
        }

        if (
            matchedRule.rate === null ||
            matchedRule.rate === undefined ||
            matchedRule.rate === "" ||
            !Number.isFinite(
                Number(matchedRule.rate)
            )
        ) {
            reasons.push(
                "The rule has no valid VAT rate."
            );
        }

        if (
            matchedRule.taxablePercent === null ||
            matchedRule.taxablePercent === undefined ||
            matchedRule.taxablePercent === "" ||
            !Number.isFinite(
                Number(
                    matchedRule.taxablePercent
                )
            )
        ) {
            reasons.push(
                "The rule has no valid taxable percentage."
            );
        }
    }

    return {
        canCalculate:
            reasons.length === 0,

        status:
            reasons.length === 0
                ? "Complete"
                : "Review Required",

        reasons
    };
}

export { valueMatches, derivedInputsMatch, dynamicInputsMatch, findMatchingRule, evaluateVatCalculationStatus };

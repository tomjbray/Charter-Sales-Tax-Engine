// Charter Sales Tax Engine - journey-context.js
//
// Pure journey-level derivation helpers. This module contains no DOM,
// application-state or jurisdiction-specific tax treatment logic.
//
// HomeRoundTrip is a geographic/business context fact only. The VATRules
// table decides what YES or NO means for a particular selling entity.

function normaliseJourneyValue(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase();
}

/**
 * Returns the itinerary airports as one ordered chain.
 *
 * Expected sector shape:
 * {
 *   origin: { country: "ZA" },
 *   destination: { country: "NA" }
 * }
 *
 * The function also accepts ISO country codes directly in originCountry /
 * destinationCountry to make Node regression tests simple and independent
 * of airports.json.
 */
function getJourneyCountryChain(itinerary) {
    if (!Array.isArray(itinerary) || itinerary.length === 0) {
        return [];
    }

    const firstSector = itinerary[0];
    const firstCountry = normaliseJourneyValue(
        firstSector?.origin?.country ??
        firstSector?.originCountry
    );

    if (!firstCountry) {
        return [];
    }

    const countries = [firstCountry];

    for (const sector of itinerary) {
        const destinationCountry = normaliseJourneyValue(
            sector?.destination?.country ??
            sector?.destinationCountry
        );

        if (!destinationCountry) {
            return [];
        }

        countries.push(destinationCountry);
    }

    return countries;
}

/**
 * Derives generic home/outside-home journey context from the complete
 * itinerary and the selling entity's home country.
 *
 * HomeRoundTrip = YES only when all three conditions are true:
 * 1. the itinerary starts in the selling entity's home country;
 * 2. the itinerary ends in the selling entity's home country; and
 * 3. at least one intermediate point is outside the home country.
 *
 * Examples for JNB / ZA:
 * JNB -> WDH -> JNB       => YES
 * JNB -> CPT -> WDH -> JNB => YES
 * JNB -> CPT -> JNB       => NO
 * JNB -> WDH              => NO
 * WDH -> JNB -> WDH       => NO
 *
 * @param {Object[]} itinerary Complete booking itinerary in travel order.
 * @param {string} homeCountry ISO home-country code of the selling entity.
 * @returns {Object}
 */
function deriveJourneyContext(itinerary, homeCountry) {
    const normalisedHomeCountry =
        normaliseJourneyValue(homeCountry);

    const countryChain =
        getJourneyCountryChain(itinerary);

    if (
        !normalisedHomeCountry ||
        countryChain.length < 2
    ) {
        return {
            HomeRoundTrip: "NO",
            startCountry: countryChain[0] ?? null,
            endCountry: countryChain.at(-1) ?? null,
            includesOutsideHomeCountry: false,
            sectorCount: Array.isArray(itinerary)
                ? itinerary.length
                : 0
        };
    }

    const startCountry = countryChain[0];
    const endCountry = countryChain[countryChain.length - 1];

    const includesOutsideHomeCountry =
        countryChain.some(
            countryCode =>
                countryCode !== normalisedHomeCountry
        );

    const startsAtHome =
        startCountry === normalisedHomeCountry;

    const endsAtHome =
        endCountry === normalisedHomeCountry;

    const homeRoundTrip =
        startsAtHome &&
        endsAtHome &&
        includesOutsideHomeCountry;

    return {
        HomeRoundTrip:
            homeRoundTrip ? "YES" : "NO",
        startCountry,
        endCountry,
        includesOutsideHomeCountry,
        sectorCount: itinerary.length
    };
}

/**
 * Convenience helper returning the rule-facing derivedInputs object.
 */
function getDerivedJourneyInputs(itinerary, homeCountry) {
    const context = deriveJourneyContext(
        itinerary,
        homeCountry
    );

    return {
        HomeRoundTrip: context.HomeRoundTrip
    };
}

export {
    deriveJourneyContext,
    getDerivedJourneyInputs,
    getJourneyCountryChain
};

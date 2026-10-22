// Charter Sales Tax Engine - MAD / Balearic apportionment lookup.
//
// This module is intentionally pure: it contains no DOM access and no
// application globals. It only resolves controlled airport-pair data from
// mad_apportionment.json.

/**
 * Normalises an airport code for comparison.
 *
 * @param {*} value
 * @returns {string}
 */
function normaliseAirportCode(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase();
}

/**
 * Returns the configured MAD/Balearic apportionment record for an airport
 * pair, or null when that route has no configured apportionment.
 *
 * The JSON export currently uses:
 * {
 *   routeCount: 174,
 *   routes: [
 *     {
 *       routePair: "AGP-IBZ",
 *       origin: "AGP",
 *       destination: "IBZ",
 *       taxablePercent: 0.7723,
 *       nonTaxablePercent: 0.2277
 *     }
 *   ]
 * }
 *
 * @param {string|Object|null} originAirport - IATA code or airport object.
 * @param {string|Object|null} destinationAirport - IATA code or airport object.
 * @param {Object|null} madApportionmentData - Loaded mad_apportionment.json.
 * @returns {Object|null}
 */
function getMadApportionment(
    originAirport,
    destinationAirport,
    madApportionmentData
) {
    const originCode = normaliseAirportCode(
        typeof originAirport === "string"
            ? originAirport
            : originAirport?.iata
    );

    const destinationCode = normaliseAirportCode(
        typeof destinationAirport === "string"
            ? destinationAirport
            : destinationAirport?.iata
    );

    if (
        !originCode ||
        !destinationCode ||
        !Array.isArray(madApportionmentData?.routes)
    ) {
        return null;
    }

    const route = madApportionmentData.routes.find(record =>
        normaliseAirportCode(record?.origin) === originCode &&
        normaliseAirportCode(record?.destination) === destinationCode
    );

    if (!route) {
        return null;
    }

    const taxablePercent = Number(route.taxablePercent);
    const nonTaxablePercent = Number(route.nonTaxablePercent);

    if (
        !Number.isFinite(taxablePercent) ||
        taxablePercent < 0 ||
        taxablePercent > 1
    ) {
        return null;
    }

    return {
        routePair:
            route.routePair ||
            `${originCode}-${destinationCode}`,
        origin: originCode,
        destination: destinationCode,
        taxablePercent,
        nonTaxablePercent:
            Number.isFinite(nonTaxablePercent)
                ? nonTaxablePercent
                : Number((1 - taxablePercent).toFixed(10))
    };
}

export {
    getMadApportionment
};

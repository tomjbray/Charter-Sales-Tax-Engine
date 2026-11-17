// Pure airport tax-territory resolution helpers.

function normalise(value) {
    return String(value ?? "").trim().toUpperCase();
}

function isTrue(value) {
    return value === true || normalise(value) === "TRUE";
}

function getRuleRegionForContext(
    countryCode,
    homeCountry,
    countriesData,
    outsideHomeRegion = ""
) {
    const country = normalise(countryCode);
    const home = normalise(homeCountry);

    if (!country) return null;

    const countryRecord = countriesData?.data?.[country];
    if (!countryRecord) return country;

    if (home && country === home) return home;

    const outside = normalise(outsideHomeRegion);
    if (outside) return outside;

    const euFlag =
        countryRecord.eUMember ??
        countryRecord.euMember;

    return isTrue(euFlag) ? "EU" : "NON_EU";
}

/**
 * Finds the explicit special tax-territory record configured for an airport.
 * This lookup is independent of the selected selling entity.
 */
function findAirportTaxTerritory(
    airport,
    taxTerritoriesData
) {
    if (!airport?.iata || !taxTerritoriesData?.data) {
        return null;
    }

    const airportCode = normalise(airport.iata);

    for (const [territoryCode, territory] of Object.entries(taxTerritoriesData.data)) {
        const airportCodes = String(territory?.airportCodes || "")
            .split(",")
            .map(normalise)
            .filter(Boolean);

        if (airportCodes.includes(airportCode)) {
            return {
                territoryCode,
                territory
            };
        }
    }

    return null;
}

/**
 * Returns an exact airport-level territory only when it belongs to the
 * selected selling entity's home country.
 */
function getAirportTaxTerritory(
    airport,
    homeCountry,
    taxTerritoriesData
) {
    const match = findAirportTaxTerritory(
        airport,
        taxTerritoriesData
    );

    if (!match) return null;

    return normalise(match.territory?.country) === normalise(homeCountry)
        ? match.territoryCode
        : null;
}

function getAirportRuleTerritory(
    airport,
    homeCountry,
    taxTerritoriesData,
    countriesData,
    outsideHomeRegion = ""
) {
    if (!airport?.country) return null;

    const country = normalise(airport.country);
    const home = normalise(homeCountry);
    const outside = normalise(outsideHomeRegion);

    const explicitMatch = findAirportTaxTerritory(
        airport,
        taxTerritoriesData
    );

    if (explicitMatch) {
        const territoryCountry = normalise(
            explicitMatch.territory?.country
        );

        // The home jurisdiction uses its detailed controlled territory code.
        if (territoryCountry === home) {
            return explicitMatch.territoryCode;
        }

        // Entity-defined outside regions, such as JNB's NON_ZA, take priority.
        if (outside) {
            return outside;
        }

        const homeRecord = countriesData?.data?.[home];
        const homeIsEu = isTrue(
            homeRecord?.eUMember ??
            homeRecord?.euMember
        );

        // For another EU VAT jurisdiction, classify the special territory by
        // its EU VAT-area status rather than by its parent's country status.
        if (homeIsEu) {
            const euAreaFlag =
                explicitMatch.territory?.eUArea ??
                explicitMatch.territory?.euArea;

            return isTrue(euAreaFlag)
                ? "EU"
                : "NON_EU";
        }
    }

    if (country === home) {
        const mainlandTerritory = Object.entries(
            taxTerritoriesData?.data || {}
        ).find(([territoryCode, territory]) =>
            normalise(territory?.country) === home &&
            normalise(territoryCode).endsWith("_MAINLAND")
        );

        if (mainlandTerritory) {
            return mainlandTerritory[0];
        }
    }

    return getRuleRegionForContext(
        country,
        home,
        countriesData,
        outside
    );
}

export {
    findAirportTaxTerritory,
    getAirportTaxTerritory,
    getAirportRuleTerritory,
    getRuleRegionForContext
};

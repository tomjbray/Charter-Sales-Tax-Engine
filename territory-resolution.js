// Pure airport tax-territory resolution helpers.

function normalise(value) {
    return String(value ?? "").trim().toUpperCase();
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

    const isEuMember =
        euFlag === true ||
        normalise(euFlag) === "TRUE";

    return isEuMember ? "EU" : "NON_EU";
}

function getAirportTaxTerritory(
    airport,
    homeCountry,
    taxTerritoriesData
) {
    if (!airport?.iata || !taxTerritoriesData?.data) {
        return null;
    }

    const airportCode = normalise(airport.iata);
    const home = normalise(homeCountry);

    for (const [territoryCode, territory] of Object.entries(taxTerritoriesData.data)) {
        if (normalise(territory?.country) !== home) {
            continue;
        }

        const airportCodes = String(territory?.airportCodes || "")
            .split(",")
            .map(normalise)
            .filter(Boolean);

        if (airportCodes.includes(airportCode)) {
            return territoryCode;
        }
    }

    return null;
}

function getAirportRuleTerritory(
    airport,
    homeCountry,
    taxTerritoriesData,
    countriesData,
    outsideHomeRegion = ""
) {
    if (!airport?.country) return null;

    const explicitTerritory = getAirportTaxTerritory(
        airport,
        homeCountry,
        taxTerritoriesData
    );

    if (explicitTerritory) {
        return explicitTerritory;
    }

    const country = normalise(airport.country);
    const home = normalise(homeCountry);

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
        outsideHomeRegion
    );
}

export {
    getAirportTaxTerritory,
    getAirportRuleTerritory,
    getRuleRegionForContext
};

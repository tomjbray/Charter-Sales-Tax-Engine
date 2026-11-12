/**
 * Charter Sales Tax Engine
 *
 * Pure calculation orchestration.
 *
 * This module:
 * - validates a calculation request;
 * - derives journey context;
 * - builds sector tax transactions;
 * - resolves tax territories;
 * - allocates charter value by distance;
 * - selects VAT rules;
 * - applies standard and apportioned calculations;
 * - returns sector results and journey totals.
 *
 * This module contains no DOM, fetch, browser-state or rendering logic.
 */

import {
    findMatchingRule,
    evaluateVatCalculationStatus
} from "./tax-engine.js";

import {
    getDerivedJourneyInputs
} from "./journey-context.js";

import {
    getAirportRuleTerritory,
    getRuleRegionForContext
} from "./territory-resolution.js";

import {
    getMadApportionment
} from "./mad-apportionment.js";

import {
    calculateItineraryAllocation
} from "./allocation.js";


/* ============================================================
   PUBLIC CALCULATION ENTRY POINT
   ============================================================ */

/**
 * Calculates tax for a complete charter request.
 *
 * The itinerary must already contain complete airport objects:
 *
 * [
 *   {
 *     sectorNumber: 1,
 *     origin: {
 *       iata: "FRA",
 *       country: "DE",
 *       lat: 50.0379,
 *       lon: 8.5622
 *     },
 *     destination: {
 *       iata: "LHR",
 *       country: "GB",
 *       lat: 51.4706,
 *       lon: -0.4619
 *     }
 *   }
 * ]
 *
 * @param {Object} request
 * @param {Object} referenceData
 * @returns {Object}
 */
export function calculate(
    request,
    referenceData
) {
    validateCalculationRequest(
        request
    );

    validateReferenceData(
        referenceData
    );

    const normalisedRequest =
        normaliseRequest(
            request
        );

    const {
        sellingEntity,
        charterValue,
        itinerary
    } = normalisedRequest;

    const entity =
        referenceData
            .sellingEntities
            .data[sellingEntity];

    if (!entity) {
        throw new Error(
            `Unknown selling entity "${sellingEntity}".`
        );
    }

    const homeCountry =
        normaliseCode(
            entity.country
        );

    if (!homeCountry) {
        throw new Error(
            `Selling entity "${sellingEntity}" ` +
            `has no home country.`
        );
    }

    const outsideHomeRegion =
        normaliseCode(
            entity.outsideHomeRegion
        );

    /*
     * Allocation is calculated once for the complete itinerary.
     * This reuses the pure module created during B2.
     */
    const {
        sectorDistances,
        totalDistanceNm,
        distancePercentages,
        allocatedNetValues
    } = calculateItineraryAllocation(
        itinerary,
        charterValue
    );

    /*
     * Journey-derived inputs are also calculated once and attached
     * to every sector transaction.
     */
    const derivedInputs =
        getDerivedJourneyInputs(
            itinerary,
            homeCountry
        );

    const sectors =
        itinerary.map(
            (
                sector,
                index
            ) => {
                const transaction =
                    buildCalculationTransaction({
                        request:
                            normalisedRequest,

                        sector,

                        homeCountry,

                        outsideHomeRegion,

                        derivedInputs,

                        referenceData
                    });

                const madApportionment =
                    sellingEntity === "MAD"
                        ? getMadApportionment(
                            sector.origin,
                            sector.destination,
                            referenceData
                                .madApportionment
                        )
                        : null;

                const {
                    matchedRule,
                    matchError
                } = findMatchingRule(
                    transaction,
                    referenceData
                        .vatRules
                        .rules
                );

                return calculateSector({
                    sector,
                    transaction,
                    matchedRule,
                    matchError,
                    madApportionment,
                    taxName:
                        getTaxNameForTransaction(
                            transaction,
                            entity
                        ),
                    distanceNm:
                        sectorDistances[index],
                    distancePercentage:
                        distancePercentages[index],
                    totalDistanceNm,
                    allocatedNetValue:
                        allocatedNetValues[index]
                });
            }
        );

    const summary =
        summariseCalculation(
            sectors,
            totalDistanceNm
        );

    return {
        schemaVersion: "1.0",

        request:
            normalisedRequest,

        context: {
            homeCountry,
            outsideHomeRegion:
                outsideHomeRegion || null,
            derivedInputs
        },

        summary,
        sectors
    };
}


/* ============================================================
   TRANSACTION CONSTRUCTION
   ============================================================ */

/**
 * Creates the normalised rule-matching transaction for one sector.
 */
function buildCalculationTransaction({
    request,
    sector,
    homeCountry,
    outsideHomeRegion,
    derivedInputs,
    referenceData
}) {
    return {
        entity:
            request.sellingEntity,

        charterType:
            request.charterType,

        customerType:
            request.customerType,

        customerLocation:
            getRuleRegionForContext(
                request.customerCountry,
                homeCountry,
                referenceData.countries,
                outsideHomeRegion
            ),

        vatRegistered:
            request.vatRegistered,

        originTerritory:
            getAirportRuleTerritory(
                sector.origin,
                homeCountry,
                referenceData.taxTerritories,
                referenceData.countries,
                outsideHomeRegion
            ),

        destinationTerritory:
            getAirportRuleTerritory(
                sector.destination,
                homeCountry,
                referenceData.taxTerritories,
                referenceData.countries,
                outsideHomeRegion
            ),

        dynamicInputs: {
            ...request.dynamicInputs
        },

        derivedInputs: {
            ...derivedInputs
        }
    };
}


/* ============================================================
   SECTOR CALCULATION
   ============================================================ */

function calculateSector({
    sector,
    transaction,
    matchedRule,
    matchError,
    madApportionment,
    taxName,
    distanceNm,
    distancePercentage,
    totalDistanceNm,
    allocatedNetValue
}) {
    const calculationCheck =
        evaluateVatCalculationStatus(
            matchedRule,
            matchError
        );

    const calculationMethod =
        normaliseCode(
            matchedRule
                ?.calculationMethod
        );

    let taxablePercent = null;
    let nonTaxablePercent = null;
    let apportionmentError = null;

    if (calculationCheck.canCalculate) {
        if (
            calculationMethod ===
            "APPORTIONED"
        ) {
            if (!madApportionment) {
                apportionmentError =
                    "No apportionment configured for " +
                    `${sector.origin.iata}-` +
                    `${sector.destination.iata}.`;
            } else {
                taxablePercent =
                    Number(
                        madApportionment
                            .taxablePercent
                    );

                nonTaxablePercent =
                    Number(
                        madApportionment
                            .nonTaxablePercent
                    );
            }
        } else {
            taxablePercent =
                Number(
                    matchedRule
                        .taxablePercent
                );

            nonTaxablePercent =
                Number(
                    (
                        1 -
                        taxablePercent
                    ).toFixed(10)
                );
        }
    }

    const reviewReasons = [
        ...calculationCheck.reasons
    ];

    if (apportionmentError) {
        reviewReasons.push(
            apportionmentError
        );
    }

    const calculationStatus =
        reviewReasons.length === 0
            ? "Complete"
            : "Review Required";

    const canCalculate =
        calculationStatus ===
            "Complete" &&
        Number.isFinite(
            taxablePercent
        ) &&
        Number.isFinite(
            nonTaxablePercent
        );

    const taxableValue =
        canCalculate
            ? allocatedNetValue *
                taxablePercent
            : null;

    const nonTaxableValue =
        canCalculate
            ? allocatedNetValue *
                nonTaxablePercent
            : null;

    const vatAmount =
        canCalculate
            ? taxableValue *
                Number(
                    matchedRule.rate
                )
            : null;

    const grossValue =
        canCalculate
            ? allocatedNetValue +
                vatAmount
            : null;

    const componentModel =
        matchedRule
            ?.ruleComponents ||
        (
            calculationMethod ===
                "APPORTIONED"
                ? "APPORTIONED"
                : "STANDARD"
        );

    const taxComponents =
        buildTaxComponents({
            matchedRule,
            calculationMethod,
            taxablePercent,
            nonTaxablePercent,
            taxableValue,
            nonTaxableValue,
            vatAmount,
            canCalculate
        });

    return {
        sector,
        transaction,
        matchedRule,
        matchError,
        taxName,
        madApportionment,
        componentModel,
        taxComponents,

        distanceNm,
        distancePercentage,
        totalDistanceNm,
        allocatedNetValue,

        taxablePercent,
        nonTaxablePercent,
        taxableValue,
        nonTaxableValue,
        vatAmount,
        grossValue,

        calculationStatus,
        reviewReasons
    };
}


/* ============================================================
   TAX COMPONENTS
   ============================================================ */

function buildTaxComponents({
    matchedRule,
    calculationMethod,
    taxablePercent,
    nonTaxablePercent,
    taxableValue,
    nonTaxableValue,
    vatAmount,
    canCalculate
}) {
    const taxComponents = [];

    if (!canCalculate) {
        return taxComponents;
    }

    taxComponents.push({
        componentType:
            "TAXABLE",

        treatment:
            matchedRule.treatment,

        percent:
            taxablePercent,

        netAmount:
            taxableValue,

        rate:
            Number(
                matchedRule.rate
            ),

        vatAmount,

        legalReference:
            matchedRule
                .legalReference ||
            "-"
    });

    if (
        calculationMethod ===
            "APPORTIONED" &&
        nonTaxablePercent > 0
    ) {
        taxComponents.push({
            componentType:
                "NON_TAXABLE",

            treatment:
                "ZERO",

            percent:
                nonTaxablePercent,

            netAmount:
                nonTaxableValue,

            rate:
                0,

            vatAmount:
                0,

            legalReference:
                matchedRule
                    .legalReference ||
                "-",

            basis:
                "Portion of the route outside the Spanish VAT territory under the Mainland/Balearic apportionment."
        });
    }

    return taxComponents;
}


/* ============================================================
   SUMMARY
   ============================================================ */

function summariseCalculation(
    sectors,
    totalDistanceNm
) {
    const reviewSectors =
        sectors.filter(
            sector =>
                sector
                    .calculationStatus !==
                "Complete"
        );

    const isComplete =
        reviewSectors.length === 0;

    const totalNetValue =
        sectors.reduce(
            (
                total,
                sector
            ) =>
                total +
                sector.allocatedNetValue,
            0
        );

    const totalTaxableValue =
        isComplete
            ? sectors.reduce(
                (
                    total,
                    sector
                ) =>
                    total +
                    sector.taxableValue,
                0
            )
            : null;

    const totalNonTaxableValue =
        isComplete
            ? sectors.reduce(
                (
                    total,
                    sector
                ) =>
                    total +
                    sector.nonTaxableValue,
                0
            )
            : null;

    const totalTaxAmount =
        isComplete
            ? sectors.reduce(
                (
                    total,
                    sector
                ) =>
                    total +
                    sector.vatAmount,
                0
            )
            : null;

    const totalGrossValue =
        isComplete
            ? sectors.reduce(
                (
                    total,
                    sector
                ) =>
                    total +
                    sector.grossValue,
                0
            )
            : null;

    return {
        calculationStatus:
            isComplete
                ? "Complete"
                : "Review Required",

        totalDistanceNm,

        totalNetValue,
        totalTaxableValue,
        totalNonTaxableValue,
        totalTaxAmount,
        totalGrossValue,

        reviewSectorCount:
            reviewSectors.length,

        reviewSectorNumbers:
            reviewSectors.map(
                sector =>
                    sector
                        .sector
                        .sectorNumber
            )
    };
}


/* ============================================================
   TAX NAME
   ============================================================ */

function getTaxNameForTransaction(
    transaction,
    entity
) {
    /*
     * Preserve the existing Canary Islands display behaviour.
     */
    if (
        transaction.entity === "MAD" &&
        transaction.originTerritory ===
            "ES_CANARY" &&
        transaction.destinationTerritory ===
            "ES_CANARY"
    ) {
        return "IGIC";
    }

    return (
        entity?.taxName ||
        entity?.TaxName ||
        "VAT"
    );
}


/* ============================================================
   INPUT NORMALISATION
   ============================================================ */

function normaliseRequest(
    request
) {
    return {
        sellingEntity:
            normaliseCode(
                request.sellingEntity
            ),

        charterType:
            normaliseCode(
                request.charterType
            ),

        customerType:
            normaliseCode(
                request.customerType
            ),

        customerCountry:
            normaliseCode(
                request.customerCountry
            ),

        vatRegistered:
            normaliseCode(
                request.vatRegistered
            ),

        charterValue:
            Number(
                request.charterValue
            ),

        currency:
            normaliseCode(
                request.currency
            ),

        transactionDate:
            request.transactionDate ||
            null,

        dynamicInputs:
            normaliseInputObject(
                request.dynamicInputs
            ),

        itinerary:
            request.itinerary.map(
                (
                    sector,
                    index
                ) => ({
                    ...sector,

                    sectorNumber:
                        Number(
                            sector
                                .sectorNumber ||
                            index + 1
                        ),

                    origin:
                        normaliseAirport(
                            sector.origin
                        ),

                    destination:
                        normaliseAirport(
                            sector.destination
                        )
                })
            )
    };
}

function normaliseAirport(
    airport
) {
    return {
        ...airport,

        iata:
            normaliseCode(
                airport.iata
            ),

        country:
            normaliseCode(
                airport.country
            ),

        lat:
            Number(
                airport.lat
            ),

        lon:
            Number(
                airport.lon
            )
    };
}

function normaliseInputObject(
    inputObject
) {
    const result = {};

    Object.entries(
        inputObject || {}
    ).forEach(
        (
            [
                propertyName,
                propertyValue
            ]
        ) => {
            if (
                propertyValue ===
                    null ||
                propertyValue ===
                    undefined ||
                propertyValue ===
                    ""
            ) {
                return;
            }

            result[propertyName] =
                typeof propertyValue ===
                    "string"
                    ? normaliseCode(
                        propertyValue
                    )
                    : propertyValue;
        }
    );

    return result;
}

function normaliseCode(
    value
) {
    return String(
        value ?? ""
    )
        .trim()
        .toUpperCase();
}


/* ============================================================
   VALIDATION
   ============================================================ */

function validateCalculationRequest(
    request
) {
    if (
        !request ||
        typeof request !== "object"
    ) {
        throw new TypeError(
            "Calculation request must be an object."
        );
    }

    const requiredTextValues = [
        [
            "sellingEntity",
            request.sellingEntity
        ],
        [
            "charterType",
            request.charterType
        ],
        [
            "customerType",
            request.customerType
        ],
        [
            "customerCountry",
            request.customerCountry
        ],
        [
            "vatRegistered",
            request.vatRegistered
        ],
        [
            "currency",
            request.currency
        ]
    ];

    requiredTextValues.forEach(
        (
            [
                propertyName,
                propertyValue
            ]
        ) => {
            if (
                normaliseCode(
                    propertyValue
                ) === ""
            ) {
                throw new Error(
                    `Calculation request is missing ${propertyName}.`
                );
            }
        }
    );

    const charterValue =
        Number(
            request.charterValue
        );

    if (
        !Number.isFinite(
            charterValue
        ) ||
        charterValue < 0
    ) {
        throw new Error(
            "Calculation request has an invalid charterValue."
        );
    }

    if (
        !Array.isArray(
            request.itinerary
        ) ||
        request.itinerary.length === 0
    ) {
        throw new Error(
            "Calculation request must contain at least one sector."
        );
    }

    request.itinerary.forEach(
        (
            sector,
            index
        ) => {
            validateAirport(
                sector?.origin,
                `Sector ${index + 1} origin`
            );

            validateAirport(
                sector?.destination,
                `Sector ${index + 1} destination`
            );

            if (
                index > 0 &&
                normaliseCode(
                    request
                        .itinerary[index - 1]
                        ?.destination
                        ?.iata
                ) !==
                normaliseCode(
                    sector
                        ?.origin
                        ?.iata
                )
            ) {
                throw new Error(
                    `Sector ${index + 1} does not continue ` +
                    `from the previous sector.`
                );
            }
        }
    );
}

function validateAirport(
    airport,
    context
) {
    if (
        !airport ||
        typeof airport !== "object"
    ) {
        throw new Error(
            `${context} airport is missing.`
        );
    }

    if (
        !normaliseCode(
            airport.iata
        )
    ) {
        throw new Error(
            `${context} IATA code is missing.`
        );
    }

    if (
        !normaliseCode(
            airport.country
        )
    ) {
        throw new Error(
            `${context} country is missing.`
        );
    }

    if (
        !Number.isFinite(
            Number(
                airport.lat
            )
        ) ||
        !Number.isFinite(
            Number(
                airport.lon
            )
        )
    ) {
        throw new Error(
            `${context} coordinates are invalid.`
        );
    }
}

function validateReferenceData(
    referenceData
) {
    if (
        !referenceData ||
        typeof referenceData !== "object"
    ) {
        throw new TypeError(
            "referenceData must be an object."
        );
    }

    const requiredDocuments = [
        [
            "countries",
            referenceData
                .countries
                ?.data
        ],
        [
            "sellingEntities",
            referenceData
                .sellingEntities
                ?.data
        ],
        [
            "taxTerritories",
            referenceData
                .taxTerritories
                ?.data
        ],
        [
            "vatRules",
            referenceData
                .vatRules
                ?.rules
        ],
        [
            "madApportionment",
            referenceData
                .madApportionment
                ?.routes
        ]
    ];

    requiredDocuments.forEach(
        (
            [
                documentName,
                documentValue
            ]
        ) => {
            if (
                documentName ===
                    "vatRules" ||
                documentName ===
                    "madApportionment"
            ) {
                if (
                    !Array.isArray(
                        documentValue
                    )
                ) {
                    throw new Error(
                        `referenceData.${documentName} is invalid.`
                    );
                }

                return;
            }

            if (
                !documentValue ||
                typeof documentValue !==
                    "object"
            ) {
                throw new Error(
                    `referenceData.${documentName} is invalid.`
                );
            }
        }
    );
}

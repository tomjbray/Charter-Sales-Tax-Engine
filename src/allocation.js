/**
 * Pure distance and charter-value allocation helpers.
 *
 * This module deliberately contains no DOM, browser state, map, tax-rule,
 * territory or rendering dependencies.
 *
 * Allocation behaviour matches the pre-extraction implementation in app.js:
 * - sector distances use Haversine great-circle distance;
 * - Earth radius is 3440.065 nautical miles;
 * - non-final sector percentages are rounded to 2 decimal places;
 * - the final sector receives the balancing percentage to make 100%;
 * - allocated values are charterValue * percentage / 100.
 */

/**
 * Calculates great-circle distance between coordinates in nautical miles
 * using the Haversine formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function haversineNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065;

    const toRad = degrees =>
        degrees * Math.PI / 180;

    const dLat =
        toRad(lat2 - lat1);

    const dLon =
        toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return (
        R *
        2 *
        Math.asin(Math.sqrt(a))
    );
}

/**
 * Calculates distances and allocation percentages for an itinerary.
 *
 * @param {Object[]} itinerary
 * @returns {{
 *   sectorDistances: number[],
 *   totalDistanceNm: number,
 *   distancePercentages: number[]
 * }}
 */
export function calculateDistanceAllocation(itinerary) {
    if (!Array.isArray(itinerary)) {
        throw new TypeError(
            "itinerary must be an array."
        );
    }

    if (itinerary.length === 0) {
        return {
            sectorDistances: [],
            totalDistanceNm: 0,
            distancePercentages: []
        };
    }

    const sectorDistances =
        itinerary.map(sector => {
            return haversineNm(
                sector.origin.lat,
                sector.origin.lon,
                sector.destination.lat,
                sector.destination.lon
            );
        });

    const totalDistanceNm =
        sectorDistances.reduce(
            (total, distance) =>
                total + distance,
            0
        );

    const distancePercentages = [];

    let allocatedPercentage = 0;

    sectorDistances.forEach(
        (distanceNm, index) => {
            const isFinalSector =
                index ===
                sectorDistances.length - 1;

            let distancePercentage;

            if (isFinalSector) {
                distancePercentage =
                    Math.max(
                        0,
                        Number(
                            (
                                100 -
                                allocatedPercentage
                            ).toFixed(2)
                        )
                    );
            } else {
                distancePercentage =
                    totalDistanceNm > 0
                        ? Number(
                            (
                                distanceNm /
                                totalDistanceNm *
                                100
                            ).toFixed(2)
                        )
                        : 0;

                allocatedPercentage +=
                    distancePercentage;
            }

            distancePercentages.push(
                distancePercentage
            );
        }
    );

    return {
        sectorDistances,
        totalDistanceNm,
        distancePercentages
    };
}

/**
 * Allocates a charter value using already calculated distance percentages.
 *
 * Percentages intentionally use percentage points because the existing
 * application stores 34.46 rather than 0.3446 internally at this stage.
 *
 * @param {number} charterValue
 * @param {number[]} distancePercentages
 * @returns {number[]}
 */
export function allocateCharterValue(
    charterValue,
    distancePercentages
) {
    return distancePercentages.map(
        distancePercentage =>
            charterValue *
            (distancePercentage / 100)
    );
}

/**
 * Convenience entry point for complete allocation.
 *
 * @param {Object[]} itinerary
 * @param {number} charterValue
 * @returns {{
 *   sectorDistances: number[],
 *   totalDistanceNm: number,
 *   distancePercentages: number[],
 *   allocatedNetValues: number[]
 * }}
 */
export function calculateItineraryAllocation(
    itinerary,
    charterValue
) {
    const {
        sectorDistances,
        totalDistanceNm,
        distancePercentages
    } = calculateDistanceAllocation(
        itinerary
    );

    const allocatedNetValues =
        allocateCharterValue(
            charterValue,
            distancePercentages
        );

    return {
        sectorDistances,
        totalDistanceNm,
        distancePercentages,
        allocatedNetValues
    };
}

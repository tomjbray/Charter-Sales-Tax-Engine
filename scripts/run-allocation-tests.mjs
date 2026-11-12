import {
    calculateItineraryAllocation,
    haversineNm
} from "../allocation.js";

function assertClose(actual, expected, tolerance, label) {
    if (
        !Number.isFinite(actual) ||
        Math.abs(actual - expected) > tolerance
    ) {
        throw new Error(
            `${label}: expected ${expected}, got ${actual}`
        );
    }
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(
            `${label}: expected ${expected}, got ${actual}`
        );
    }
}

function airport(iata, lat, lon) {
    return {
        iata,
        lat,
        lon
    };
}

/*
 * Zero distance must return zero.
 */
assertEqual(
    haversineNm(
        51.4706,
        -0.4619,
        51.4706,
        -0.4619
    ),
    0,
    "Zero-distance Haversine"
);

/*
 * A single sector must receive 100% of the charter value.
 */
const singleSector =
    calculateItineraryAllocation(
        [
            {
                sectorNumber: 1,
                origin: airport(
                    "AAA",
                    50,
                    0
                ),
                destination: airport(
                    "BBB",
                    51,
                    1
                )
            }
        ],
        10000
    );

assertEqual(
    singleSector.distancePercentages[0],
    100,
    "Single-sector allocation percentage"
);

assertEqual(
    singleSector.allocatedNetValues[0],
    10000,
    "Single-sector allocated value"
);

/*
 * Multi-sector allocation must balance to exactly 100%.
 */
const twoSector =
    calculateItineraryAllocation(
        [
            {
                sectorNumber: 1,
                origin: airport(
                    "AAA",
                    50,
                    0
                ),
                destination: airport(
                    "BBB",
                    51,
                    1
                )
            },
            {
                sectorNumber: 2,
                origin: airport(
                    "BBB",
                    51,
                    1
                ),
                destination: airport(
                    "CCC",
                    53,
                    4
                )
            }
        ],
        10000
    );

assertClose(
    twoSector.distancePercentages.reduce(
        (total, percentage) =>
            total + percentage,
        0
    ),
    100,
    0.000001,
    "Two-sector allocation total"
);

assertClose(
    twoSector.allocatedNetValues.reduce(
        (total, value) =>
            total + value,
        0
    ),
    10000,
    0.01,
    "Two-sector value total"
);

console.log("Allocation tests passed.");

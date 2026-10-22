/*
 * UI layout adapter for the Charter Sales Tax Engine.
 *
 * This small companion module moves the already-rendered tax-components
 * panels above the detailed VAT results and wraps rule traces in native,
 * collapsed disclosure controls. It does not change any tax calculation.
 */

function moveTaxComponentsAboveDetails() {
    const source = document.getElementById("vatSectorResults");
    const target = document.getElementById("taxComponentsResults");

    if (!source || !target) {
        return;
    }

    target.innerHTML = "";

    source.querySelectorAll(".vat-sector-card").forEach(card => {
        const heading = card.querySelector(":scope > .vat-sector-heading");
        const componentPanel = card.querySelector(":scope > .vat-tax-components");

        if (!componentPanel) {
            return;
        }

        const componentCard = document.createElement("section");
        componentCard.className = "vat-sector-card tax-components-sector-card";

        if (heading) {
            componentCard.appendChild(heading.cloneNode(true));
        }

        componentCard.appendChild(componentPanel);
        target.appendChild(componentCard);
    });
}

function collapseRuleTraces() {
    const source = document.getElementById("vatSectorResults");

    if (!source) {
        return;
    }

    source.querySelectorAll(".rule-trace-panel").forEach(panel => {
        if (panel.closest(".rule-trace-details")) {
            return;
        }

        const details = document.createElement("details");
        details.className = "rule-trace-details";

        const summary = document.createElement("summary");
        const matchedRule =
            panel.querySelector(".rule-trace-heading strong")?.textContent?.trim();

        summary.textContent = matchedRule
            ? `Rule Match Trace · ${matchedRule}`
            : "Rule Match Trace";

        panel.parentNode.insertBefore(details, panel);
        details.appendChild(summary);
        details.appendChild(panel);
    });
}

function refreshResultPresentation() {
    moveTaxComponentsAboveDetails();
    collapseRuleTraces();
}

const resultContainer = document.getElementById("vatSectorResults");

if (resultContainer) {
    const observer = new MutationObserver(() => {
        requestAnimationFrame(refreshResultPresentation);
    });

    observer.observe(resultContainer, {
        childList: true,
        subtree: true
    });
}

document.addEventListener("DOMContentLoaded", refreshResultPresentation);
refreshResultPresentation();

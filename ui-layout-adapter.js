/* Charter Sales Tax Engine - presentation adapter.
 * Presentation only: does not alter tax calculations.
 */

function refreshTaxPresentation() {
    const detailContainer = document.getElementById("vatSectorResults");
    const componentContainer = document.getElementById("taxComponentsResults");

    if (!detailContainer || !componentContainer) {
        return;
    }

    componentContainer.innerHTML = "";

    detailContainer.querySelectorAll(".vat-sector-card").forEach(card => {
        const heading = card.querySelector(":scope > .vat-sector-heading");
        const componentPanel = card.querySelector(".vat-tax-components");

        if (componentPanel) {
            const componentCard = document.createElement("section");
            componentCard.className = "vat-sector-card tax-components-sector-card";

            if (heading) {
                componentCard.appendChild(heading.cloneNode(true));
            }

            componentCard.appendChild(componentPanel);
            componentContainer.appendChild(componentCard);
        }

        const tracePanel = card.querySelector(":scope > .rule-trace-panel");

        if (tracePanel && !tracePanel.closest(".rule-trace-details")) {
            const details = document.createElement("details");
            details.className = "rule-trace-details";

            const summary = document.createElement("summary");
            const ruleId = tracePanel
                .querySelector(".rule-trace-heading strong")
                ?.textContent
                ?.replace("Matched Rule:", "")
                ?.trim();

            summary.textContent = ruleId
                ? `Rule Match Trace · ${ruleId}`
                : "Rule Match Trace";

            tracePanel.parentNode.insertBefore(details, tracePanel);
            details.appendChild(summary);
            details.appendChild(tracePanel);
        }
    });
}

const vatResults = document.getElementById("vatSectorResults");

if (vatResults) {
    let refreshPending = false;

    const observer = new MutationObserver(() => {
        if (refreshPending) {
            return;
        }

        refreshPending = true;

        requestAnimationFrame(() => {
            refreshPending = false;
            refreshTaxPresentation();
        });
    });

    observer.observe(vatResults, {
        childList: true,
        subtree: true
    });
}

refreshTaxPresentation();

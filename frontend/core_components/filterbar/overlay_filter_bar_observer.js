// overlay_filter_bar_observer.js

/**
 * Kuuntelee .filterBar‑elementtien ilmestymistä JA classList‑muutoksia
 * ja synkronoi mobileFilterOverlay‑elementin näkyvyyden niiden kanssa.
 *
 * Korjaus: lisätty childList‑seuranta, jotta overlay aktivoituu heti
 * sivun latauksen jälkeen, kun filterBar luodaan DOM‑puuhun 📱✨
 */
(function attachFilterBarObserver() {
    /* ----------------------------------------------------- */
    /* 1. Overlay – luodaan tai haetaan, jos jo olemassa     */
    /* ----------------------------------------------------- */
    function getOrCreateMobileFilterOverlay() {
        let overlay = document.getElementById("mobileFilterOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "mobileFilterOverlay";
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.backgroundColor = "rgba(0,0,0,0.4)";
            overlay.style.zIndex = "9998";
            overlay.style.display = "none";
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    const mobileFilterOverlay = getOrCreateMobileFilterOverlay();
    const FILTERBAR_MOBILE_THRESHOLD = 1000;

    /* ----------------------------------------------------- */
    /* 2. Yhtenäinen overlay‑synkkausfunktio                 */
    /* ----------------------------------------------------- */
    function syncOverlayVisibility() {
        const anyVisibleFilterBar = [...document.querySelectorAll(".filterBar")].some(
            (bar) => !bar.classList.contains("hidden")
        );
        if (window.innerWidth < FILTERBAR_MOBILE_THRESHOLD && anyVisibleFilterBar) {
            mobileFilterOverlay.style.display = "block";
        } else {
            mobileFilterOverlay.style.display = "none";
        }
    }

    /* ----------------------------------------------------- */
    /* 3. MutationObserver                                   */
    /* ----------------------------------------------------- */
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === "attributes" && m.attributeName === "class") {
                if (m.target.classList.contains("filterBar")) {
                    syncOverlayVisibility();
                }
            } else if (m.type === "childList") {
                m.addedNodes.forEach((node) => {
                    if (
                        node.nodeType === 1 &&
                        node.classList &&
                        node.classList.contains("filterBar")
                    ) {
                        syncOverlayVisibility();
                    }
                });
            }
        }
    });

    observer.observe(document.body, {
        attributes: true,
        childList: true,      // <- uusi
        subtree: true,
        attributeFilter: ["class"],
    });

    /* ----------------------------------------------------- */
    /* 4. Ensisynkronointi + resize‑kuuntelija               */
    /* ----------------------------------------------------- */
    syncOverlayVisibility();
    window.addEventListener("resize", syncOverlayVisibility);
})();

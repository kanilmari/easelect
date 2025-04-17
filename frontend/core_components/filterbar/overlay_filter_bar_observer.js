// overlay_filter_bar_observer.js

/**
 * Kuuntelee .filterBar‑elementtien classList‑muutoksia ja
 * synkronoi mobileFilterOverlay‑elementin näkyvyyden niiden kanssa.
 */
(function attachFilterBarObserver() {
    /** Hakee (tai luo) overlay‑elementin.  */
    function getOrCreateMobileFilterOverlay() {
        let overlay = document.getElementById("mobileFilterOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "mobileFilterOverlay";
            // samat inline‑tyylit kuin alkuperäisessä toteutuksessa
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

    /** Käsittelee yhden filterBar‑elementin tämänhetkisen hidden‑tilan. */
    function syncOverlayWithFilterBar(filterBarEl) {
        const filterBarIsHidden = filterBarEl.classList.contains("hidden");
        if (filterBarIsHidden) {
            mobileFilterOverlay.style.display = "none";
        } else if (window.innerWidth < 1000) {
            mobileFilterOverlay.style.display = "block";
        }
    }

    /** Itse MutationObserver – kuuntelee attribuuttimuutoksia. */
    const observer = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
            if (
                mutation.type === "attributes" &&
                mutation.attributeName === "class"
            ) {
                const filterBarEl = mutation.target;
                if (filterBarEl.classList.contains("filterBar")) {
                    syncOverlayWithFilterBar(filterBarEl);
                }
            }
        }
    });

    // Käynnistetään observer koko dokumenttiin,
    // mutta rajataan se vain class‑attribuutteihin.
    observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"],
    });

    // Varmuuden vuoksi synkronoidaan jo olemassa olevat filterBarit heti.
    document
        .querySelectorAll(".filterBar")
        .forEach((bar) => syncOverlayWithFilterBar(bar));
})();
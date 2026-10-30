
(() => {
    "use strict";

    const CONFIG = {
        origin: "https://www.wiki-masters.com",
        path: "/marketplace/",
        blockId: "wiki-marketplace-custom-panel"
    };

    const CONTROLLER_KEY = "__wikiMastersMarketplaceController";

    // Éviter les initialisations multiples
    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].destroy();
    }

    let cleanupFeature = null;
    let navigationWatcher = null;

    // =====================================================
    // DÉTECTION DE LA PAGE
    // =====================================================

    function isTargetPage() {
        return (
            location.origin === CONFIG.origin &&
            location.pathname.startsWith(CONFIG.path) &&
            location.pathname.length > CONFIG.path.length
        );
    }

    // =====================================================
    // RECHERCHE DU BLOC ORIGINAL
    // =====================================================

    function findOriginalBlock() {

        const input = [...document.querySelectorAll(
            'input[aria-label="Montant de la mise"]'
        )].find(el => !el.closest("#" + CONFIG.blockId));

        if (!input) return null;

        const card = input.closest(".card-frame");
        if (!card) return null;

        const button = [...card.querySelectorAll("button")].find(
            b => b.textContent.trim() === "Miser"
        );

        if (!button) return null;

        return { card, input, button };
    }

    // =====================================================
    // CRÉATION DU PANNEAU PERSONNALISÉ
    // =====================================================

    function initFeature() {

        let customPanel = null;
        let observer = null;

        function createPanel() {

            const original = findOriginalBlock();

            if (!original) return;

            if (customPanel?.isConnected) return;

            document.getElementById(CONFIG.blockId)?.remove();

            // =================================================
            // CONTENEUR PRINCIPAL
            // =================================================

            customPanel = document.createElement("div");
            customPanel.id = CONFIG.blockId;

            customPanel.style.cssText = `
                margin-top: 14px;
                padding: 16px;
                border-radius: 12px;
                border: 1px solid var(--color-border);
                background: color-mix(
                    in srgb,
                    var(--color-surface) 82%,
                    var(--color-accent) 18%
                );
                color: var(--color-foreground);
            `;

            // =================================================
            // TITRE
            // =================================================

            const title = document.createElement("div");

            title.textContent = "Mise personnalisée";

            title.style.cssText = `
                font-size: 13px;
                font-weight: 700;
                margin-bottom: 12px;
            `;

            customPanel.appendChild(title);

            // =================================================
            // CHAMP ET BOUTONS + / -
            // =================================================

            const amountContainer = document.createElement("div");

            amountContainer.style.cssText = `
                display: flex;
                align-items: stretch;
                gap: 8px;
                width: 100%;
            `;

            function createSideButton(label) {

                const button = document.createElement("button");

                button.type = "button";
                button.textContent = label;
                button.style.cssText = `
                    width: 46px;
                    flex-shrink: 0;
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    background: var(--color-surface);
                    color: var(--color-foreground);
                    font-size: 22px;
                    font-weight: 600;
                    cursor: pointer;
                `;

                return button;
            }

            const decrease = createSideButton("−");
            const increase = createSideButton("+");

            decrease.setAttribute("aria-label", "Diminuer de 10 %");
            increase.setAttribute("aria-label", "Augmenter de 10 %");

            const input = document.createElement("input");

            input.type = "number";
            input.inputMode = "numeric";
            input.step = "1";
            input.min = original.input.min || "0";
            input.value = original.input.value;

            input.setAttribute(
                "aria-label",
                "Montant de la mise personnalisée"
            );

            input.style.cssText = `
                flex: 1;
                min-width: 0;
                padding: 11px 8px;
                border: 1px solid var(--color-border);
                border-radius: 8px;
                background: var(--color-surface);
                color: var(--color-foreground);
                font-size: 16px;
                font-weight: 600;
                text-align: center;
                outline: none;
            `;

            const minimum = Number(input.min) || 0;

            function getCustomAmount() {
                return Number(input.value);
            }

            function updateAmount(value) {

                input.value = String(
                    Math.max(minimum, Math.round(value))
                );

            }

            // +10 % et -10 % sur le montant personnalisé actuel

            decrease.addEventListener("click", () => {

                const current = getCustomAmount();

                if (!Number.isFinite(current)) return;

                updateAmount(current * 0.90);
            });

            increase.addEventListener("click", () => {

                const current = getCustomAmount();

                if (!Number.isFinite(current)) return;

                updateAmount(current * 1.10);
            });

            amountContainer.appendChild(decrease);
            amountContainer.appendChild(input);
            amountContainer.appendChild(increase);

            customPanel.appendChild(amountContainer);

            // =================================================
            // BOUTONS DE POURCENTAGE
            // Basés sur le champ ORIGINAL du site
            // =================================================

            const quickActions = document.createElement("div");

            quickActions.style.cssText = `
                display: flex;
                gap: 8px;
                margin-top: 10px;
                width: 100%;
            `;

            [0, 10, 25, 50].forEach(percent => {

                const button = document.createElement("button");

                button.type = "button";

                if (percent === 0) {
                    button.textContent = `=`;
                } else {
                    button.textContent = `+${percent}%`;
                }

                button.style.cssText = `
                    flex: 1;
                    padding: 10px 5px;
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    background: var(--color-surface);
                    color: var(--color-foreground);
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                `;

                button.addEventListener("click", () => {

                    // Toujours relire la mise originale du site
                    const currentOriginal = findOriginalBlock();

                    if (!currentOriginal) return;

                    const baseAmount = Number(
                        currentOriginal.input.value
                    );

                    if (!Number.isFinite(baseAmount)) return;

                    // Calcul indépendant du champ personnalisé
                    const newAmount = Math.round(
                        baseAmount * (1 + percent / 100)
                    );

                    updateAmount(newAmount);
                });

                quickActions.appendChild(button);
            });

            customPanel.appendChild(quickActions);

            // =================================================
            // BOUTON MISER
            // =================================================

            const submit = document.createElement("button");

            submit.type = "button";
            submit.textContent = "Miser";

            submit.style.cssText = `
                display: block;
                width: 100%;
                margin-top: 12px;
                padding: 12px;
                border: none;
                border-radius: 8px;
                background: var(--color-accent);
                color: var(--color-accent-foreground);
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
            `;

            submit.addEventListener("click", () => {

                const current = findOriginalBlock();

                if (!current) return;

                const amount = Number(input.value);
                const min = Number(current.input.min) || 0;

                if (
                    !Number.isFinite(amount) ||
                    !Number.isInteger(amount) ||
                    amount < min
                ) {
                    console.warn(
                        "Wiki Masters : montant invalide."
                    );
                    return;
                }

                // Mise à jour du véritable champ du site
                const descriptor = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value"
                );

                if (!descriptor?.set) return;

                descriptor.set.call(
                    current.input,
                    String(amount)
                );

                current.input.dispatchEvent(
                    new Event("input", { bubbles: true })
                );

                current.input.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

                // Déclenchement du bouton original
                current.button.click();
            });

            customPanel.appendChild(submit);

            // =================================================
            // INSERTION APRÈS LE BLOC ORIGINAL
            // =================================================

            original.card.insertAdjacentElement(
                "afterend",
                customPanel
            );

            console.log(
                "Wiki Masters : panneau personnalisé ajouté."
            );
        }

        // =================================================
        // SURVEILLANCE DU DOM
        // =================================================

        observer = new MutationObserver(() => {

            if (!customPanel?.isConnected) {
                customPanel = null;
                createPanel();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        createPanel();

        // =================================================
        // NETTOYAGE
        // =================================================

        return function cleanup() {

            observer?.disconnect();

            customPanel?.remove();
            customPanel = null;

            console.log(
                "Wiki Masters : panneau personnalisé supprimé."
            );
        };
    }

    // =====================================================
    // NAVIGATION
    // =====================================================

    function checkNavigation() {

        if (!document.body) return;

        if (isTargetPage()) {

            if (cleanupFeature !== null) return;

            cleanupFeature = initFeature();

            console.log(
                "Wiki Masters : arrivée sur Marketplace."
            );

        } else if (cleanupFeature !== null) {

            cleanupFeature();
            cleanupFeature = null;

            console.log(
                "Wiki Masters : départ de Marketplace."
            );
        }
    }

    // =====================================================
    // HISTORIQUE
    // =====================================================

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function patchedPushState(...args) {
        const result = originalPushState.apply(this, args);
        checkNavigation();
        return result;
    }

    function patchedReplaceState(...args) {
        const result = originalReplaceState.apply(this, args);
        checkNavigation();
        return result;
    }

    history.pushState = patchedPushState;
    history.replaceState = patchedReplaceState;

    // =====================================================
    // CONTRÔLEUR
    // =====================================================

    function destroy() {

        cleanupFeature?.();
        cleanupFeature = null;

        clearInterval(navigationWatcher);

        window.removeEventListener("popstate", checkNavigation);
        window.removeEventListener("hashchange", checkNavigation);
        window.removeEventListener("pageshow", checkNavigation);

        if (history.pushState === patchedPushState) {
            history.pushState = originalPushState;
        }

        if (history.replaceState === patchedReplaceState) {
            history.replaceState = originalReplaceState;
        }

        delete window[CONTROLLER_KEY];
    }

    window[CONTROLLER_KEY] = {
        checkNavigation,
        destroy
    };

    window.addEventListener("popstate", checkNavigation);
    window.addEventListener("hashchange", checkNavigation);
    window.addEventListener("pageshow", checkNavigation);

    // =====================================================
    // DÉMARRAGE
    // =====================================================

    function start() {

        if (!document.body) {
            document.addEventListener(
                "DOMContentLoaded",
                start,
                { once: true }
            );
            return;
        }

        checkNavigation();

        navigationWatcher = setInterval(
            checkNavigation,
            500
        );
    }

    start();

})();

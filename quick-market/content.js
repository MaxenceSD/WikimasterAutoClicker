(() => {
    "use strict";

    const BUTTON_ID = "wkm-quick-market-open-button";
    const CONTROLLER_KEY = "__wkmQuickMarketController";
    const TARGET_PATH = "/collection";

    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].destroy();
    }

    let observer = null;
    let currentButton = null;
    let currentModal = null;
    let isOpening = false;

    function isCollectionPage() {
        return location.origin === "https://www.wiki-masters.com" &&
            location.pathname.replace(/\/$/, "") === TARGET_PATH;
    }

    function findCollectionHeading() {
        return [...document.querySelectorAll('h1.text-2xl.md\\:text-3xl.font-bold')]
            .find(h1 => h1.textContent.trim() === "Collection") || null;
    }

    function createOpenButton(title) {
        const container = document.createElement("div");
        container.id = "wkm-qm-button-container";
        container.className = "wkm-qm-button-container";

        const button = document.createElement("button");
        button.id = BUTTON_ID;
        button.type = "button";
        button.className = "wkm-qm-open-button";
        button.textContent = "Marché rapide";

        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            button.disabled = true;

            try {
                await openQuickMarket();
            } finally {
                button.disabled = false;
            }
        });

        container.appendChild(button);

        // Nouvelle div sous le conteneur du titre
        title.parentElement.insertAdjacentElement("afterend", container);

        return button;
    }

    function ensureButton() {
        if (!isCollectionPage()) return;

        const heading = findCollectionHeading();

        if (!heading) return;

        if (document.getElementById(BUTTON_ID)) return;

        currentButton = createOpenButton(heading);
    }

    async function openQuickMarket() {
        if (isOpening) return;

        isOpening = true;

        if (currentButton) {
            currentButton.disabled = true;
            currentButton.classList.add("is-loading");
        }

        try {
            const [cards, settings] = await Promise.all([
                window.WKMQuickMarketApi.getLegendaryCards(),
                window.WKMQuickMarketStorage.load()
            ]);

            // Ne montrer que les cartes légendaires actuellement présentes dans la collection.
            // Les réglages des cartes absentes restent stockés : une carte rendue après une
            // enchère sans acheteur retrouvera ainsi son prix et sa sélection.
            currentModal = window.WKMQuickMarketModal.open({
                cards,
                settings,
                onSave: updatedSettings => window.WKMQuickMarketStorage.save(updatedSettings),
                onSell: sellSelectedCards
            });
        } catch (error) {
            console.error("[WKM Quick Market] Impossible d'ouvrir la fenêtre :", error);
            window.alert(`Impossible de charger Marché rapide.\n${error.message}`);
        } finally {
            isOpening = false;

            if (currentButton?.isConnected) {
                currentButton.disabled = false;
                currentButton.classList.remove("is-loading");
            }
        }
    }

    async function sellSelectedCards(selectedCards, durationMinutes, modalControls) {
        modalControls.setBusy(true);

        try {
            const capacity = await window.WKMQuickMarketApi.getMarketplaceCapacity();

            if (capacity.availableSlots <= 0) {
                modalControls.setStatus(
                    `Tu as déjà atteint la limite de ${capacity.maxConcurrentAuctions} ventes simultanées.`,
                    "warning"
                );
                return;
            }

            const cardsToSell = selectedCards.slice(0, capacity.availableSlots);
            const skippedCount = selectedCards.length - cardsToSell.length;
            let successCount = 0;
            let failureCount = 0;

            if (skippedCount > 0) {
                modalControls.setStatus(
                    `${capacity.availableSlots} place(s) disponible(s) : ${skippedCount} carte(s) resteront en attente.`,
                    "warning"
                );
            }

            for (let index = 0; index < cardsToSell.length; index += 1) {
                const card = cardsToSell[index];

                modalControls.setStatus(
                    `Mise en vente ${index + 1}/${cardsToSell.length} : ${card.title}…`,
                    "info"
                );

                try {
                    const result = await window.WKMQuickMarketApi.createAuction({
                        cardId: card.ownedId,
                        baseAmount: card.baseAmount,
                        durationMinutes
                    });

                    successCount += 1;
                    modalControls.markSuccess(card.id);
                    console.info(
                        `[WKM Quick Market] Vente créée pour ${card.title}. Auction ID :`,
                        result.auction_id || "non fourni"
                    );
                } catch (error) {
                    failureCount += 1;
                    modalControls.setStatus(
                        `Échec pour ${card.title} : ${error.message}. Les autres cartes seront conservées.`,
                        "error"
                    );
                    console.error(`[WKM Quick Market] Échec de vente pour ${card.title} :`, error);
                }
            }

            if (successCount > 0 && failureCount === 0) {
                modalControls.setStatus(
                    `${successCount} vente(s) créée(s). Les cartes ont été retirées de cette liste.`,
                    "success"
                );
            } else if (successCount > 0) {
                modalControls.setStatus(
                    `${successCount} vente(s) créée(s), ${failureCount} échec(s). Les cartes en échec restent sélectionnées.`,
                    "warning"
                );
            } else if (failureCount > 0) {
                modalControls.setStatus(
                    `Aucune vente créée. Tes sélections et tes prix ont été conservés.`,
                    "error"
                );
            }

            if (skippedCount > 0 && successCount > 0) {
                modalControls.setStatus(
                    `${successCount} vente(s) créée(s). ${skippedCount} carte(s) restent sélectionnées pour plus tard.`,
                    "success"
                );
            }
        } catch (error) {
            modalControls.setStatus(`Impossible de lancer les ventes : ${error.message}`, "error");
            console.error("[WKM Quick Market] Erreur pendant les ventes :", error);
        } finally {
            modalControls.setBusy(false);
        }
    }

    function destroy() {
        observer?.disconnect();
        document.getElementById(BUTTON_ID)?.remove();
        currentModal?.close();
        currentButton = null;
        currentModal = null;
    }

    observer = new MutationObserver(ensureButton);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Les changements de page internes déclenchent généralement des mutations DOM.
    window.addEventListener("popstate", ensureButton);
    ensureButton();

    window[CONTROLLER_KEY] = { destroy };
})();

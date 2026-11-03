(() => {
    "use strict";

    const CONTROLLER_KEY = "__wkmQuickAuctionController";

    const CARD_SELECTOR = '[id^="marketplace-auction-"]';
    const PANEL_CLASS = "wkm-qa-panel";

    // Évite les doubles injections du module.
    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].destroy();
    }

    let observer = null;

    /**
     * Vérifie que nous sommes sur la page marketplace.
     */
    function isMarketplacePage() {
        return (
            location.origin === "https://www.wiki-masters.com" &&
            location.pathname.replace(/\/$/, "") === "/marketplace"
        );
    }

    function isBrowseTabActive() {
        const tabButtons = document.querySelectorAll(
            "div.flex.overflow-x-auto.border-b button"
        );

        const browseButton = [...tabButtons].find(
            button => button.textContent.trim() === "Parcourir"
        );

        return Boolean(
            browseButton &&
            browseButton.classList.contains("border-b-2")
        );
    }

    /**
     * Récupère l'identifiant de l'enchère depuis l'identifiant
     * du conteneur HTML.
     *
     * Exemple :
     * marketplace-auction-xxxxxxxx
     */
    function getAuctionId(cardElement) {
        const prefix = "marketplace-auction-";

        if (!cardElement.id.startsWith(prefix)) {
            return "";
        }

        return cardElement.id.slice(prefix.length);
    }

    /**
     * Dans le HTML fourni, le nom du vendeur correspond
     * au dernier paragraphe de la carte.
     */
    function getSellerElement(cardElement) {
        const paragraphs = cardElement.querySelectorAll("p");

        if (paragraphs.length === 0) {
            return null;
        }

        return paragraphs[paragraphs.length - 1];
    }

    /**
     * Calcule le montant minimum proposé.
     *
     * Sans mise :
     * base_amount
     *
     * Avec une mise :
     * current_bid + 1
     */
    function getMinimumBid(auction) {
        const baseAmount = Number(auction.base_amount) || 0;

        const currentBid =
            auction.current_bid === null ||
                auction.current_bid === undefined
                ? null
                : Number(auction.current_bid);

        // Aucune mise : on s'aligne sur la mise de départ.
        if (currentBid === null || !Number.isFinite(currentBid)) {
            return Math.max(1, baseAmount);
        }

        // Une mise existe : on ajoute 10 %.
        return Math.max(
            1,
            baseAmount,
            Math.ceil(currentBid * 1.10)
        );
    }

    /**
     * Formate un montant selon les conventions françaises.
     */
    function formatAmount(amount) {
        return new Intl.NumberFormat("fr-FR").format(amount);
    }

    /**
     * Crée un bouton avec une icône et un libellé accessible.
     */
    function createIconButton(icon, label, className) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = className;
        button.textContent = icon;

        button.title = label;
        button.setAttribute("aria-label", label);

        return button;
    }

    /**
     * Modifie le message d'état affiché sous les contrôles.
     */
    function setPanelMessage(panel, message, state = "info") {
        const status = panel.querySelector(".wkm-qa-status");

        status.textContent = message;
        status.dataset.state = state;
    }

    /**
     * Actualise les informations de l'enchère.
     *
     * updateInput :
     * true  = remplace le montant saisi par le minimum actualisé.
     * false = conserve le montant déjà saisi.
     */
    async function refreshAuction(
        panel,
        auctionId,
        updateInput = true
    ) {
        const refreshButton = panel.querySelector(".wkm-qa-refresh");
        const bidButton = panel.querySelector(".wkm-qa-bid");
        const amountInput = panel.querySelector(".wkm-qa-amount");

        refreshButton.disabled = true;
        refreshButton.classList.add("is-loading");

        // On bloque les mises pendant l'actualisation.
        bidButton.disabled = true;

        setPanelMessage(panel, "Actualisation…");

        try {
            const auction =
                await window.WKMQuickAuctionApi.getAuction(auctionId);

            const minimumBid = getMinimumBid(auction);

            panel.dataset.minimumBid = String(minimumBid);
            panel.dataset.auctionStatus = auction.status || "";

            if (updateInput || !amountInput.value) {
                amountInput.value = String(minimumBid);
            }

            if (auction.status !== "active") {
                setPanelMessage(
                    panel,
                    "Cette enchère n'est plus active.",
                    "warning"
                );

                bidButton.disabled = true;

                return;
            }

            bidButton.disabled = false;
        } catch (error) {
            setPanelMessage(
                panel,
                error.message,
                "error"
            );

        } finally {
            refreshButton.disabled = false;
            refreshButton.classList.remove("is-loading");
        }
    }

    /**
     * Envoie une mise après clic manuel sur le bouton.
     */
    async function submitBid(panel, auctionId) {
        const amountInput = panel.querySelector(".wkm-qa-amount");
        const bidButton = panel.querySelector(".wkm-qa-bid");

        const amount = Number(amountInput.value);
        const minimumBid = Number(panel.dataset.minimumBid);

        // Vérification du montant saisi.
        if (!Number.isSafeInteger(amount) || amount < 1) {
            setPanelMessage(
                panel,
                "Saisis un montant entier valide.",
                "error"
            );

            amountInput.focus();

            return;
        }

        // Vérification du minimum connu.
        if (
            !Number.isFinite(minimumBid) ||
            amount < minimumBid
        ) {
            setPanelMessage(
                panel,
                `La mise minimale est de ${formatAmount(minimumBid)}. Actualise si nécessaire.`,
                "warning"
            );

            amountInput.focus();

            return;
        }

        bidButton.disabled = true;

        setPanelMessage(
            panel,
            "Envoi de la mise…"
        );

        try {
            const result =
                await window.WKMQuickAuctionApi.placeBid(
                    auctionId,
                    amount
                );

            const acceptedAmount = Number(
                result.current_bid ?? amount
            );

            setPanelMessage(
                panel,
                `Mise enregistrée : ${formatAmount(acceptedAmount)}.`,
                "success"
            );
        } catch (error) {
            setPanelMessage(
                panel,
                error.message,
                "error"
            );

            bidButton.disabled =
                panel.dataset.auctionStatus !== "active";
        }
    }

    /**
     * Crée le panneau Quick Auction.
     */
    function createPanel(auctionId) {
        const panel = document.createElement("section");

        panel.className = PANEL_CLASS;
        panel.dataset.auctionId = auctionId;

        panel.innerHTML = `
            <div class="wkm-qa-controls" >
                <input
                    class="wkm-qa-amount"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    aria-label="Montant de la mise"
                    placeholder="Mise">

                <button
                    class="wkm-qa-icon-button wkm-qa-refresh"
                    type="button"
                    title="Actualiser la mise minimale"
                    aria-label="Actualiser la mise minimale"
                >↻</button>

                <button
                    class="wkm-qa-icon-button wkm-qa-bid"
                    type="button"
                    title="Placer une mise"
                    aria-label="Placer une mise"
                    disabled
                >⚖</button>

            </div>

            <p
                class="wkm-qa-status"
                role="status"
                aria-live="polite"
            ></p>
        `;

        const refreshButton =
            panel.querySelector(".wkm-qa-refresh");

        const bidButton =
            panel.querySelector(".wkm-qa-bid");

        // Les contrôles sont insérés dans une carte qui contient
        // un lien. On empêche donc la navigation au clic.
        ["click", "pointerdown", "mousedown", "touchstart"].forEach(eventName => {
            panel.addEventListener(eventName, event => {
                event.stopPropagation();

                if (eventName === "click") {
                    event.preventDefault();
                }
            });
        });

        refreshButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            refreshAuction(
                panel,
                auctionId,
                true
            );
        });

        bidButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            submitBid(
                panel,
                auctionId
            );
        });

        return panel;
    }

    /**
     * Ajoute Quick Auction sur une carte.
     */
    function addQuickAuctionPanel(cardElement) {
        // Ne crée pas deux panneaux sur la même carte.
        if (cardElement.querySelector(`.${PANEL_CLASS} `)) {
            return;
        }

        const auctionId = getAuctionId(cardElement);
        const sellerElement = getSellerElement(cardElement);

        if (
            !auctionId ||
            !sellerElement ||
            !window.WKMQuickAuctionApi
        ) {
            return;
        }

        const panel = createPanel(auctionId);

        // Insertion juste avant le nom du vendeur.
        sellerElement.insertAdjacentElement(
            "beforebegin",
            panel
        );
    }

    /**
     * Parcourt les cartes présentes sur la page.
     */
    function scanMarketplace() {
        if (!isMarketplacePage()) {
            return;
        }

        // Dans les autres onglets, on retire tous les panneaux.
        if (!isBrowseTabActive()) {
            document
                .querySelectorAll(`.${PANEL_CLASS}`)
                .forEach(panel => panel.remove());

            return;
        }

        // Dans Parcourir, on ajoute les panneaux aux cartes.
        document
            .querySelectorAll(CARD_SELECTOR)
            .forEach(addQuickAuctionPanel);
    }

    /**
     * Nettoyage du module.
     */
    function destroy() {
        observer?.disconnect();

        document
            .querySelectorAll(`.${PANEL_CLASS} `)
            .forEach(panel => panel.remove());
    }

    // La marketplace peut charger ses cartes progressivement.
    observer = new MutationObserver(scanMarketplace);

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
    });

    scanMarketplace();

    window[CONTROLLER_KEY] = {
        destroy
    };
})();
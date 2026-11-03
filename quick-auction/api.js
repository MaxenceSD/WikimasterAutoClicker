(() => {
    "use strict";

    const MARKETPLACE_API_URL = `${location.origin}/api/marketplace`;

    /**
     * Lit la réponse JSON et transforme les erreurs HTTP
     * en erreurs JavaScript exploitables par l'interface.
     */
    async function readJson(response) {
        const responseText = await response.text();
        let data = {};

        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch {
                data = {
                    message: responseText
                };
            }
        }

        if (!response.ok) {
            const message =
                data.error ||
                data.message ||
                `Erreur HTTP ${response.status}`;

            const error = new Error(message);

            error.status = response.status;
            error.code = data.code || null;

            throw error;
        }

        return data;
    }

    /**
     * Récupère les informations actualisées d'une enchère.
     *
     * Retourne notamment :
     * - base_amount
     * - current_bid
     * - status
     */
    async function getAuction(auctionId) {
        const response = await fetch(
            `${MARKETPLACE_API_URL}/${encodeURIComponent(auctionId)}`,
            {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const data = await readJson(response);

        if (!data.auction) {
            throw new Error(
                "La réponse ne contient pas les informations de l'enchère."
            );
        }

        return data.auction;
    }

    /**
     * Envoie une mise avec le montant choisi par l'utilisateur.
     */
    async function placeBid(auctionId, amount) {
        const response = await fetch(
            `${MARKETPLACE_API_URL}/${encodeURIComponent(auctionId)}/bid`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    amount
                })
            }
        );

        return readJson(response);
    }

    window.WKMQuickAuctionApi = {
        getAuction,
        placeBid
    };
})();
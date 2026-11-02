(() => {
    "use strict";

    const API_BASE = `${location.origin}/api`;
    const COLLECTION_URL = `${API_BASE}/my-collection?sort=rarity&page=0&stats=0`;
    const MARKETPLACE_MINE_URL = `${API_BASE}/marketplace/mine`;
    const MARKETPLACE_URL = `${API_BASE}/marketplace`;

    async function readJson(response) {
        const text = await response.text();
        let data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = { message: text };
            }
        }

        if (!response.ok) {
            const message = data.message || data.error || `Erreur HTTP ${response.status}`;
            throw new Error(message);
        }

        return data;
    }

    async function getLegendaryCards() {
        const response = await fetch(COLLECTION_URL, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        const data = await readJson(response);
        const collection = Array.isArray(data.collection) ? data.collection : [];

        return collection
            .map(item => {
                const card = item.card || {};

                if (!item.id || !card.id || card.rarity !== "L") {
                    return null;
                }

                return {
                    id: card.id,
                    ownedId: item.id,
                    title: card.wikipedia_title || "Carte sans nom",
                    imageUrl: card.image_url || "",
                    rarity: card.rarity,
                    atk: card.atk,
                    def: card.def
                };
            }).filter(Boolean);
    }

    async function getMarketplaceCapacity() {
        const response = await fetch(MARKETPLACE_MINE_URL, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        const data = await readJson(response);
        const sellingCount = Number(data.sellingCount);
        const maxConcurrentAuctions = Number(data.maxConcurrentAuctions);

        if (!Number.isFinite(sellingCount) || !Number.isFinite(maxConcurrentAuctions)) {
            throw new Error("Impossible de déterminer le nombre de ventes disponibles.");
        }

        return {
            sellingCount,
            maxConcurrentAuctions,
            availableSlots: Math.max(0, maxConcurrentAuctions - sellingCount)
        };
    }

    async function createAuction({ cardId, baseAmount, durationMinutes }) {
        const response = await fetch(MARKETPLACE_URL, {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                card_id: cardId,
                base_amount: baseAmount,
                duration_minutes: durationMinutes
            })
        });

        return readJson(response);
    }

    window.WKMQuickMarketApi = {
        getLegendaryCards,
        getMarketplaceCapacity,
        createAuction
    };
})();

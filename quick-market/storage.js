(() => {
    "use strict";

    const STORAGE_KEY = "wkmQuickMarketSettings";
    const DEFAULT_SETTINGS = {
        version: 1,
        durationMinutes: 10,
        cards: {}
    };

    function cloneDefaults() {
        return {
            ...DEFAULT_SETTINGS,
            cards: {}
        };
    }

    function normalizeSettings(value) {
        if (!value || typeof value !== "object") {
            return cloneDefaults();
        }

        const settings = cloneDefaults();
        const duration = Number(value.durationMinutes);
        const allowedDurations = [10, 30, 60, 180, 360, 720];

        if (allowedDurations.includes(duration)) {
            settings.durationMinutes = duration;
        }

        if (value.cards && typeof value.cards === "object") {
            for (const [cardId, cardSettings] of Object.entries(value.cards)) {
                if (!cardSettings || typeof cardSettings !== "object") {
                    continue;
                }

                settings.cards[cardId] = {
                    selected: Boolean(cardSettings.selected),
                    baseAmount: cardSettings.baseAmount === undefined
                        ? ""
                        : String(cardSettings.baseAmount)
                };
            }
        }

        return settings;
    }

    function load() {
        return new Promise((resolve, reject) => {
            if (!chrome?.storage?.local) {
                reject(new Error("chrome.storage.local est indisponible."));
                return;
            }

            chrome.storage.local.get(STORAGE_KEY, result => {
                const error = chrome.runtime?.lastError;

                if (error) {
                    reject(new Error(error.message));
                    return;
                }

                resolve(normalizeSettings(result[STORAGE_KEY]));
            });
        });
    }

    function save(settings) {
        const normalized = normalizeSettings(settings);

        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => {
                const error = chrome.runtime?.lastError;

                if (error) {
                    reject(new Error(error.message));
                    return;
                }

                resolve(normalized);
            });
        });
    }

    window.WKMQuickMarketStorage = {
        load,
        save,
        normalizeSettings
    };
})();

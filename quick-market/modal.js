(() => {
    "use strict";

    const DURATIONS = [
        { value: 10, label: "10 min" },
        { value: 30, label: "30 min" },
        { value: 60, label: "1 h" },
        { value: 180, label: "3 h" },
        { value: 360, label: "6 h" },
        { value: 720, label: "12 h" }
    ];

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function open({ cards, settings, onSave, onSell }) {
        const overlay = createElement("div", "wkm-qm-overlay");
        const dialog = createElement("section", "wkm-qm-dialog");
        const header = createElement("header", "wkm-qm-header");
        const headingGroup = createElement("div", "wkm-qm-heading-group");
        const title = createElement("h2", "wkm-qm-title", "Marché rapide");
        const subtitle = createElement(
            "p",
            "wkm-qm-subtitle",
            "Sélectionne jusqu'à 5 légendaires et définis leur prix."
        );
        const closeButton = createElement("button", "wkm-qm-close", "×");
        const body = createElement("div", "wkm-qm-body");
        const durationSection = createElement("section", "wkm-qm-duration-section");
        const durationTitle = createElement("h3", "wkm-qm-section-title", "Durée commune");
        const durationOptions = createElement("div", "wkm-qm-duration-options");
        const cardsSection = createElement("section", "wkm-qm-cards-section");
        const cardsTitle = createElement("h3", "wkm-qm-section-title", `Cartes légendaires (${cards.length})`);
        const cardsList = createElement("div", "wkm-qm-cards-list");
        const footer = createElement("footer", "wkm-qm-footer");
        const status = createElement("p", "wkm-qm-status");
        const sellButton = createElement("button", "wkm-qm-sell-button", "Mettre en vente (0)");

        let selectedDuration = Number(settings.durationMinutes) || 10;
        let isBusy = false;
        let isClosed = false;
        const completedCardIds = new Set();

        // Récupération des anciens réglages enregistrés avec l'identifiant du modèle.
        for (const card of cards) {
            if (
                !settings.cards[card.id] &&
                card.legacyId &&
                settings.cards[card.legacyId]
            ) {
                settings.cards[card.id] = settings.cards[card.legacyId];
                delete settings.cards[card.legacyId];
            }
        }

        // Une ancienne sauvegarde ne doit jamais restaurer plus de 5 sélections.
        let initialSelectedCount = 0;
        for (const card of cards) {
            const cardSettings = settings.cards[card.id];
            if (!cardSettings?.selected) continue;

            initialSelectedCount += 1;
            if (initialSelectedCount > 5) {
                cardSettings.selected = false;
            }
        }

        function countSelected() {
            return cards.filter(card =>
                settings.cards[card.id]?.selected && !completedCardIds.has(card.id)
            ).length;
        }

        function persist() {
            Promise.resolve(onSave(settings)).catch(error => {
                setStatus(`Erreur de sauvegarde : ${error.message}`, "error");
            });
        }

        function setStatus(message, type = "info") {
            status.textContent = message;
            status.dataset.type = type;
        }

function updateSelectionUi() {
    const selectedCount = countSelected();

    sellButton.textContent = `Mettre en vente (${selectedCount})`;
    sellButton.disabled = isBusy || selectedCount === 0;

    for (const row of cardsList.querySelectorAll(".wkm-qm-card-row")) {
        const cardSettings = settings.cards[row.dataset.cardId];
        const selected = Boolean(cardSettings?.selected);

        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-checked", String(selected));

        const disabled = isBusy || (!selected && selectedCount >= 5);
        row.setAttribute("aria-disabled", String(disabled));

        const priceInput = row.querySelector(".wkm-qm-price-input");
        if (priceInput) {
            priceInput.disabled = isBusy;
        }
    }
}

        function close() {
            if (isBusy || isClosed) {
                return;
            }

            isClosed = true;
            document.removeEventListener("keydown", onKeyDown);
            overlay.remove();
            document.documentElement.classList.remove("wkm-qm-no-scroll");
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                close();
            }
        }

function createCardRow(card) {
    const cardSettings = settings.cards[card.id] || {
        selected: false,
        baseAmount: ""
    };

    settings.cards[card.id] = cardSettings;

    const row = createElement("article", "wkm-qm-card-row");
    row.dataset.cardId = card.id;
    row.setAttribute("role", "checkbox");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `Sélectionner ${card.title}`);
    row.setAttribute("aria-checked", String(Boolean(cardSettings.selected)));

    // Indicateur visuel de sélection
    const selectionMark = createElement("span", "wkm-qm-card-check", "✓");

    const image = createElement("img", "wkm-qm-card-image");
    image.alt = "";
    image.loading = "lazy";

    if (card.imageUrl && /^https:\/\//i.test(card.imageUrl)) {
        image.src = card.imageUrl;
    } else {
        image.classList.add("is-empty");
    }

    const details = createElement("div", "wkm-qm-card-details");
    const cardTitle = createElement("div", "wkm-qm-card-title", card.title);
    const cardMeta = createElement("div", "wkm-qm-card-meta", "Légendaire");

    details.append(cardTitle, cardMeta);

    const priceGroup = createElement("label", "wkm-qm-price-group");

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "1";
    priceInput.step = "1";
    priceInput.inputMode = "numeric";
    priceInput.placeholder = "Montant";
    priceInput.className = "wkm-qm-price-input";
    priceInput.value = cardSettings.baseAmount;
    priceInput.disabled = isBusy;
    priceInput.setAttribute("aria-label", `Prix de ${card.title}`);

    priceGroup.append(priceInput);

    function toggleSelection() {
        if (isBusy) return;

        if (completedCardIds.has(card.id)) return;

        if (!cardSettings.selected && countSelected() >= 5) {
            setStatus("Tu peux sélectionner 5 cartes maximum.", "warning");
            return;
        }

        cardSettings.selected = !cardSettings.selected;

        persist();
        updateSelectionUi();
    }

    // Clic sur toute la carte, sauf sur le champ de prix
    row.addEventListener("click", event => {
        if (event.target.closest(".wkm-qm-price-group")) return;

        toggleSelection();
    });

    // Navigation au clavier
    row.addEventListener("keydown", event => {
        if (event.target !== row) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSelection();
        }
    });

    priceInput.addEventListener("input", () => {
        cardSettings.baseAmount = priceInput.value;
        persist();
    });

    row.append(selectionMark, image, details, priceGroup);

    return row;
}

        for (const duration of DURATIONS) {
            const label = createElement("label", "wkm-qm-duration-option");
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "wkm-qm-duration";
            radio.value = String(duration.value);
            radio.checked = selectedDuration === duration.value;
            radio.disabled = isBusy;
            const text = createElement("span", "", duration.label);

            radio.addEventListener("change", () => {
                if (!radio.checked) return;

                selectedDuration = duration.value;
                settings.durationMinutes = selectedDuration;
                persist();
            });

            label.append(radio, text);
            durationOptions.appendChild(label);
        }

        if (cards.length === 0) {
            cardsList.appendChild(createElement(
                "p",
                "wkm-qm-empty",
                "Aucune carte légendaire disponible dans ta collection."
            ));
        } else {
            for (const card of cards) {
                cardsList.appendChild(createCardRow(card));
            }
        }

        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Fermer");
        closeButton.addEventListener("click", close);

        sellButton.type = "button";
        sellButton.addEventListener("click", async () => {
            if (isBusy) return;

            const selectedCards = cards
                .filter(card => settings.cards[card.id]?.selected && !completedCardIds.has(card.id))
                .map(card => ({
                    ...card,
                    baseAmount: Number(settings.cards[card.id].baseAmount)
                }));

            if (selectedCards.length === 0) {
                setStatus("Sélectionne au moins une carte.", "warning");
                return;
            }

            const invalidCard = selectedCards.find(card =>
                !Number.isSafeInteger(card.baseAmount) || card.baseAmount <= 0
            );

            if (invalidCard) {
                setStatus(`Indique un prix entier supérieur à 0 pour « ${invalidCard.title} ».`, "warning");
                const row = cardsList.querySelector(`[data-card-id="${CSS.escape(invalidCard.id)}"]`);
                row?.querySelector(".wkm-qm-price-input")?.focus();
                return;
            }

            await onSell(selectedCards, selectedDuration, controls);
        });

        headingGroup.append(title, subtitle);
        header.append(headingGroup, closeButton);
        durationSection.append(durationTitle, durationOptions);
        cardsSection.append(cardsTitle, cardsList);
        body.append(durationSection, cardsSection);
        footer.append(status, sellButton);
        dialog.append(header, body, footer);
        overlay.appendChild(dialog);

        overlay.addEventListener("click", event => {
            if (event.target === overlay) {
                close();
            }
        });

        const controls = {
            setStatus,
            setBusy(value) {
                isBusy = Boolean(value);
                sellButton.disabled = isBusy || countSelected() === 0;
                closeButton.disabled = isBusy;

                for (const input of dialog.querySelectorAll("input")) {
                    input.disabled = isBusy;
                }
                updateSelectionUi();
            },
            markSuccess(cardId) {
                completedCardIds.add(cardId);
                const row = cardsList.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
                row?.classList.add("is-sold");
                row?.remove();
                updateSelectionUi();
            },
            close
        };

        document.body.appendChild(overlay);
        document.documentElement.classList.add("wkm-qm-no-scroll");
        document.addEventListener("keydown", onKeyDown);
        updateSelectionUi();

        return controls;
    }

    window.WKMQuickMarketModal = { open };
})();

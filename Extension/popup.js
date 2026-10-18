
const toggle = document.getElementById("toggle");
const stateText = document.getElementById("stateText");
const stateDot = document.getElementById("stateDot");
const logPanel = document.getElementById("logPanel");
const emptyLog = document.getElementById("emptyLog");
const logBadge = document.getElementById("logBadge");

function afficherEtat(active) {
    stateText.textContent = active ? "Automatisation active" : "Désactivée";
    stateDot.classList.toggle("active", active);

    toggle.classList.toggle("is-active", active);
    toggle.textContent = active
        ? "■   Désactiver l'automatisation"
        : "▶   Activer l'automatisation";

    logBadge.textContent = active ? "En cours" : "À l'arrêt";
}

function afficherJournal(logs = []) {
    logPanel.replaceChildren();

    if (logs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Aucune activité pour le moment.";
        logPanel.appendChild(empty);
        return;
    }

    // Les messages les plus récents apparaissent en premier.
    [...logs].reverse().forEach((entry, index) => {
        const item = document.createElement("div");
        item.className = "log-entry" + (index === 0 ? " latest" : "");

        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = entry.time;

        const message = document.createElement("div");
        message.className = "log-message";
        message.textContent = entry.message;

        item.append(time, message);
        logPanel.appendChild(item);
    });
}

async function actualiserInterface() {
    const data = await chrome.storage.local.get([
        "autoClickRunning",
        "autoClickLog"
    ]);

    afficherEtat(Boolean(data.autoClickRunning));
    afficherJournal(data.autoClickLog || []);
}

toggle.addEventListener("click", async () => {
    toggle.disabled = true;

    try {
        const data = await chrome.storage.local.get("autoClickRunning");
        const action = data.autoClickRunning ? "stop" : "start";

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab?.id) {
            logBadge.textContent = "Aucun onglet";
            return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, { action });

        if (response?.message) {
            console.log(response.message);
        }

        if (action === "start" && response?.message?.includes("introuvable")) {
            logBadge.textContent = "Bouton introuvable";
            return;
        }

        afficherEtat(action === "start");
        await actualiserInterface();
    } catch (error) {
        logBadge.textContent = "Erreur";
        stateText.textContent = "Connexion impossible";

        console.error(error);
    } finally {
        toggle.disabled = false;
    }
});

// Actualisation des données enregistrées.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.autoClickRunning) {
        afficherEtat(Boolean(changes.autoClickRunning.newValue));
    }

    if (changes.autoClickLog) {
        afficherJournal(changes.autoClickLog.newValue || []);
    }
});

actualiserInterface();

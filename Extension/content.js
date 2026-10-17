
let running = false;
let currentRun = 0;
let timers = new Set();

function attendre(ms, runId) {
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            timers.delete(timer);
            resolve(running && currentRun === runId);
        }, ms);

        timers.add(timer);
    });
}

// Recherche le bouton principal "Ouvrir"
function trouverBoutonOuvrir() {
    return [...document.querySelectorAll("button")].find(bouton => {
        const image = bouton.querySelector(
            'img[alt="Ouvrir un paquet"]'
        );

        return image && bouton.innerText.trim().includes("Ouvrir");
    });
}

// Recherche le bouton fléché fourni
function trouverBoutonFleche() {
    return [...document.querySelectorAll("button")].find(bouton => {
        return bouton.querySelector(
            'svg polyline[points="9 18 15 12 9 6"]'
        );
    });
}

// Recherche le bouton "Terminer"
function trouverBoutonContinuer() {
    return [...document.querySelectorAll("button")].find(
        bouton => bouton.innerText.trim() === "Continuer"
    );
}


async function executerCycle(runId) {
    // 1. Attendre 30 secondes après l'ouverture du paquet
    console.log("Attente de 30 secondes...");

    if (!await attendre(15000, runId)) return;

    // 2. Cliquer 4 fois sur la flèche, à 1 seconde d'intervalle
    for (let i = 0; i < 4; i++) {
        if (!running || currentRun !== runId) return;

        const fleche = trouverBoutonFleche();

        if (!fleche) {
            console.warn("Bouton fléché introuvable.");
            return;
        }

        if (fleche.disabled) {
            console.warn("Bouton fléché désactivé.");
            return;
        }

        fleche.click();
        console.log(`Clic sur la flèche ${i + 1}/4`);

        if (i < 3) {
            if (!await attendre(1000, runId)) return;
        }
    }

    // 3. Attendre une seconde après le quatrième clic
    if (!await attendre(1000, runId)) return;

    // 4. Trouver et cliquer sur "Terminer"
    const continuer = trouverBoutonContinuer();

    if (!continuer) {
        console.warn('Bouton "Continuer" introuvable.');
        afficherAction('Bouton « Continuer » introuvable.');
        return;
    }

    if (continuer.disabled) {
        console.warn('Bouton "Continuer" désactivé.');
        afficherAction('Bouton « Continuer » désactivé.');
        return;
    }

    continuer.click();
    console.log('Bouton "Continuer" cliqué.');
    afficherAction('Bouton « Continuer » cliqué !');
}

async function boucleAutomatique(runId) {
    while (running && currentRun === runId) {

        // Clic immédiat sur "Ouvrir"
        const ouvrir = trouverBoutonOuvrir();

        if (!ouvrir) {
            console.warn('Bouton "Ouvrir" introuvable.');
            break;
        }

        if (ouvrir.disabled) {
            console.warn('Bouton "Ouvrir" désactivé.');
            break;
        }

        ouvrir.click();
        console.log('Bouton "Ouvrir" cliqué.');

        // Effectuer la séquence après l'ouverture
        await executerCycle(runId);

        if (!running || currentRun !== runId) return;

        // Attendre un délai aléatoire avant le prochain paquet
        const delai = 10 * 60 * 1000 + 30 * 1000;

        console.log(
            `Prochain paquet dans ${Math.floor(delai / 60000)} min ` +
            `${Math.floor((delai % 60000) / 1000)} s.`
        );

        if (!await attendre(delai, runId)) return;
    }

    if (currentRun === runId) {
        running = false;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start") {
        if (running) {
            sendResponse({ message: "Automatisation déjà active." });
            return;
        }

        if (!trouverBoutonOuvrir()) {
            sendResponse({
                message: 'Bouton "Ouvrir" introuvable sur cette page.'
            });
            return;
        }

        running = true;
        currentRun++;
        const runId = currentRun;

        // Démarre immédiatement, sans attendre le délai aléatoire
        boucleAutomatique(runId);

        sendResponse({
            message: "Activé ! Premier clic immédiat."
        });
    }

    if (message.action === "stop") {
        running = false;
        currentRun++;

        // Annuler les attentes en cours
        for (const timer of timers) {
            clearTimeout(timer);
        }

        timers.clear();

        sendResponse({
            message: "Automatisation arrêtée."
        });
    }

    return true;
});

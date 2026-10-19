
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
    return [...document.querySelectorAll("button")].find(bouton =>
        bouton.innerText.trim().includes("Ouvrir")
    );
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
    // 1. Attendre 20 secondes après l'ouverture du paquet
    console.log("Attente de 15 secondes");
    afficherAction("Attente de 15 secondes")

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

        afficherAction("Next")
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
        return;
    }

    if (continuer.disabled) {
        console.warn('Bouton "Continuer" désactivé.');
        return;
    }

    afficherAction("Click 'Continuer'")
    continuer.click();
    console.log('Bouton "Continuer" cliqué.');

    const date = new Date();
    date.setMinutes(date.getMinutes() + 9.5);

    afficherAction("Ouverture terminée (prochaine : " + date.toLocaleString("fr-FR") + ")")
}

async function boucleAutomatique(runId) {
    while (running && currentRun === runId) {

        // Clic immédiat sur "Ouvrir"
        const ouvrir = trouverBoutonOuvrir();

        if (!ouvrir) {
            console.warn('Bouton "Ouvrir" introuvable.');
            afficherAction("Bouton 'Ouvrir' introuvable")
            break;
        } else {
            afficherAction("Bouton 'Ouvrir' trouvé")
        }

        if (ouvrir.disabled) {
            console.warn('Bouton "Ouvrir" désactivé.');
            break;
        }

        afficherAction("Ouverture du pack")
        ouvrir.click();
        console.log('Bouton "Ouvrir" cliqué.');

        // Effectuer la séquence après l'ouverture
        await executerCycle(runId);

        if (!running || currentRun !== runId) return;

        // Attendre un délai de 9min30 avant le prochain paquet
        const delai = 9.5 * 60 * 1000;

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
            sendResponse({
                message: "Automatisation déjà active."
            });
            return true;
        }

        if (!trouverBoutonOuvrir()) {
            sendResponse({
                message: 'Bouton "Ouvrir" introuvable sur cette page.'
            });
            return true;
        }

        running = true;
        currentRun++;

        const runId = currentRun;

        Promise.all([
            enregistrerEtat(true),
            afficherAction("Automatisation démarrée.")
        ]).then(() => {
            boucleAutomatique(runId);
        }).then(() => {
            if (currentRun === runId && !running) {
                return enregistrerEtat(false);
            }
        }).catch(console.error);

        sendResponse({
            message: "Automatisation activée !"
        });

        return true;
    }

    if (message.action === "stop") {
        running = false;
        currentRun++;

        for (const timer of timers) {
            clearTimeout(timer);
        }

        timers.clear();

        Promise.all([
            enregistrerEtat(false),
            afficherAction("Automatisation arrêtée.")
        ]).catch(console.error);

        sendResponse({
            message: "Automatisation arrêtée."
        });

        return true;
    }
});

async function afficherAction(message) {
    const data = await chrome.storage.local.get("autoClickLog");
    const logs = data.autoClickLog || [];

    logs.push({
        time: new Date().toLocaleTimeString("fr-FR"),
        message
    });

    await chrome.storage.local.set({
        autoClickLog: logs.slice(-100)
    });
}

async function enregistrerEtat(active) {
    await chrome.storage.local.set({
        autoClickRunning: active
    });
}
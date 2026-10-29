
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

async function wait(runId, delayMin, delayVar) {
    delayMin = delayMin * 1000;
    delayVar = delayVar * 1000;

    const delay = (Math.random() * delayVar) + delayMin

    afficherAction('Wait : ' + delay / 1000);

    if (!await attendre(delay, runId)) return;
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

async function executerCycle(runId, delay) {
    // 1. Attendre x secondes après l'ouverture du paquet
    console.log("Attente vérification bot");
    afficherAction("Attente vérification bot")

    await wait(runId, 30, delay);

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

        if (i < 4) {
            await wait(runId, 1, 3);
        }
    }

    // 3. Trouver et cliquer sur "Terminer"
    const continuer = trouverBoutonContinuer();

    if (!continuer) {
        console.warn('Bouton "Continuer" introuvable.');
        return;
    }

    if (continuer.disabled) {
        console.warn('Bouton "Continuer" désactivé.');
        return;
    }

    continuer.click();
    console.log('Bouton "Continuer" cliqué.');
    afficherAction("Click 'Continuer'")
}

async function boucleAutomatique(runId) {
    while (running && currentRun === runId) {

        const ouvrir = trouverBoutonOuvrir();

        // Si le bouton existe et est activé, lancer le cycle.
        if (ouvrir && !ouvrir.disabled) {
            const txt = "Bouton Ouvrir activé : lancement du cycle.";
            console.log(txt);
            afficherAction(txt)

            ouvrir.click();
            console.log('Bouton "Ouvrir" cliqué.');

            await executerCycle(runId, 45);

            if (!running || currentRun !== runId) return;

        } else {
            const txt = 'Bouton "Ouvrir" non trouvé.';
            console.log(txt);
            afficherAction(txt)

            const fleche = trouverBoutonFleche();
            if (fleche) {
                await executerCycle(runId, 0);
            }
        }

        // Attendre avant le prochain contrôle.
        afficherAction("Attente nouvelle vérification")
        await wait(runId, 300, 45);
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
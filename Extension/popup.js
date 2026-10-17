
const status = document.getElementById("status");

async function sendCommand(action) {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab?.id) {
        status.textContent = "Aucun onglet actif.";
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: action
        });

        status.textContent = response.message;
    } catch (error) {
        console.log('Erreur : ' + error);
        status.textContent =
            "Recharge la page de test et réessaie.";
    }
}

document.getElementById("start").addEventListener("click", () => {
    sendCommand("start");
});

document.getElementById("stop").addEventListener("click", () => {
    sendCommand("stop");
});


(() => {
    "use strict";

    // =====================================================
    // CONFIGURATION
    // =====================================================

    const CONFIG = {
        origin: "https://www.wiki-masters.com",
        path: "/pulls",

        initialDelay: 30,
        openDelay: 45,

        arrowClicks: 4,
        arrowDelay: 1,
        arrowDelayRandom: 3,

        checkDelay: 300,
        checkDelayRandom: 45
    };

    // =====================================================
    // INITIALISATION
    // =====================================================

    if (
        location.origin !== CONFIG.origin ||
        location.pathname.replace(/\/+$/, "") !== CONFIG.path ||
        window.__wikiMastersAutomationLoaded
    ) return;

    window.__wikiMastersAutomationLoaded = true;

    let running = false;
    let runId = 0;
    let nextActionAt = null;
    let timer = null;

    // =====================================================
    // WIDGET
    // =====================================================

    const host = document.createElement("div");
    host.id = "wiki-masters-overlay";

    host.style.cssText = `
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 2147483647;
    `;

    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
        <style>
            * { box-sizing: border-box; }

            .widget {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 12px 8px 8px;
                background: #0b0f19;
                color: white;
                border: 1px solid #263247;
                border-radius: 12px;
                box-shadow: 0 5px 22px #0005;
                font-family: Arial, sans-serif;
                user-select: none;
            }

            button {
                width: 34px;
                height: 34px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                border: 1px solid #be7180;
                background: #4a202b;
                color: #ffc2ce;
                cursor: pointer;
            }

            button.active {
                background: #14532d;
                color: #bbf7d0;
                border-color: #22c55e;
            }

            button svg {
                width: 17px;
                height: 17px;
            }

            .label {
                font-size: 10px;
                color: #94a3b8;
                margin-bottom: 3px;
                white-space: nowrap;
            }

            .countdown {
                font-size: 15px;
                font-weight: bold;
                font-variant-numeric: tabular-nums;
            }
        </style>

        <div class="widget">
            <button id="toggle" title="Activer">
                <svg viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2"
                    stroke-linecap="round">
                    <path d="M12 2v10"/>
                    <path d="M5.5 5.5a9 9 0 1 0 13 0"/>
                </svg>
            </button>

            <div>
                <div class="countdown" id="countdown">--:--</div>
            </div>
        </div>
    `;

    const $ = id => shadow.getElementById(id);

    const button = $("toggle");
    const countdown = $("countdown");

    const powerIcon = button.innerHTML;

    const stopIcon = `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
    `;

    // =====================================================
    // AFFICHAGE
    // =====================================================

    function updateWidget() {
        button.innerHTML = running ? stopIcon : powerIcon;
        button.classList.toggle("active", running);
        button.title = running ? "Désactiver" : "Activer";

        if (!running || nextActionAt === null) {
            countdown.textContent = "--:--";
            return;
        }

        const seconds = Math.max(
            0,
            Math.ceil((nextActionAt - Date.now()) / 1000)
        );

        countdown.textContent =
            String(Math.floor(seconds / 60)).padStart(2, "0") +
            ":" +
            String(seconds % 60).padStart(2, "0");
    }

    const countdownInterval = setInterval(updateWidget, 250);

    // =====================================================
    // GESTION DES ATTENTES
    // =====================================================

    function wait(run, min, random = 0) {
        if (!running || run !== runId) {
            return Promise.resolve(false);
        }

        const delay = (min + Math.random() * random) * 1000;

        nextActionAt = Date.now() + delay;
        updateWidget();

        return new Promise(resolve => {
            timer = setTimeout(() => {
                timer = null;

                const valid = running && run === runId;

                nextActionAt = null;
                updateWidget();

                resolve(valid);
            }, delay);
        });
    }

    function stop() {
        running = false;
        runId++;

        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        nextActionAt = null;
        updateWidget();
    }

    // =====================================================
    // RECHERCHE DES BOUTONS
    // =====================================================

    function findOpen() {
        return [...document.querySelectorAll("button")].find(
            b => b.textContent.trim().includes("Ouvrir")
        );
    }

    function findArrow() {
        return document.querySelector(
            'button svg polyline[points="9 18 15 12 9 6"]'
        )?.closest("button") || null;
    }

    function findContinue() {
        return [...document.querySelectorAll("button")].find(
            b => b.textContent.trim() === "Continuer"
        );
    }

    // =====================================================
    // CYCLE AUTOMATIQUE
    // =====================================================

    async function executeCycle(run, delay) {

        // Attente initiale
        if (!await wait(run, CONFIG.initialDelay, delay)) return;

        // 4 clics sur la flèche
        for (let i = 0; i < CONFIG.arrowClicks; i++) {

            if (!running || run !== runId) return;

            const arrow = findArrow();

            if (!arrow || arrow.disabled) {
                console.warn("Bouton fléché indisponible.");
                return;
            }

            arrow.click();

            // Attente après chaque clic, y compris le dernier
            if (!await wait(
                run,
                CONFIG.arrowDelay,
                CONFIG.arrowDelayRandom
            )) return;
        }

        // Cliquer sur Continuer
        if (!running || run !== runId) return;

        const next = findContinue();

        if (!next || next.disabled) {
            console.warn("Bouton Continuer indisponible.");
            return;
        }

        next.click();
    }

    // =====================================================
    // BOUCLE PRINCIPALE
    // =====================================================

    async function loop(run) {
        while (running && run === runId) {

            const open = findOpen();

            if (open && !open.disabled) {
                open.click();
                await executeCycle(run, CONFIG.openDelay);

            } else if (findArrow()) {
                await executeCycle(run, 0);
            }

            if (!running || run !== runId) return;

            if (!await wait(
                run,
                CONFIG.checkDelay,
                CONFIG.checkDelayRandom
            )) return;
        }
    }

    // =====================================================
    // DÉMARRAGE
    // =====================================================

    function start() {
        if (running) return;

        running = true;
        const run = ++runId;

        updateWidget();

        loop(run).catch(error => {
            console.error("Erreur automatisation :", error);
            if (run === runId) stop();
        });
    }

    // =====================================================
    // BOUTON
    // =====================================================

    button.addEventListener("click", () => {
        if (running) {
            stop();
        } else {
            start();
        }
    });

    // =====================================================
    // NETTOYAGE
    // =====================================================

    window.addEventListener("pagehide", () => {
        stop();
        clearInterval(countdownInterval);
    }, { once: true });

})();

const socket = io();

//==============================================
// ÉTAT LOCAL
//==============================================
let monId       = null;
let maClasse    = null;
let mesAttaques = null;
let maPosition  = null;
let bouclierMaintenu = false; // héro : clic droit maintenu

const elementsDuJeu   = {};
const elementsProjets = {};
const elementesZones  = {};

const keys = {};
const CHAR_SIZE    = 50;
const ARENA_WIDTH  = 6900;
const ARENA_HEIGHT = 4000;

//==============================================
// ÉLÉMENTS HTML & CAMÉRA
//==============================================
const arena = document.querySelector(".arena");
arena.style.width    = ARENA_WIDTH  + "px";
arena.style.height   = ARENA_HEIGHT + "px";
arena.style.position = "absolute";
document.body.style.overflow = "hidden";
document.body.style.position = "relative";

function mettreAJourCamera(joueurX, joueurY) {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    let camX = vpW / 2 - (joueurX + CHAR_SIZE / 2);
    let camY = vpH / 2 - (joueurY + CHAR_SIZE / 2);
    camX = Math.min(0, Math.max(vpW - ARENA_WIDTH,  camX));
    camY = Math.min(0, Math.max(vpH - ARENA_HEIGHT, camY));
    arena.style.transform = `translate(${camX}px, ${camY}px)`;
    return { camX, camY };
}
let cameraOffset   = { camX: 0, camY: 0 };
// Dernière position connue du curseur (pour le dash si aucune touche ZQSD enfoncée)
let derniereCursorX = 0;
let derniereCursorY = 0;
document.addEventListener("mousemove", (e) => {
    derniereCursorX = e.clientX;
    derniereCursorY = e.clientY;
});

//==============================================
// CRÉATION / SUPPRESSION PERSONNAGES
//==============================================
function creerElementPersonnage(joueur) {
    const div = document.createElement("div");
    div.className = `character ${joueur.classe}`;
    div.dataset.id = joueur.id;
    div.style.left         = joueur.x + "px";
    div.style.top          = joueur.y + "px";
    div.style.opacity      = joueur.pv <= 0 ? "0.3" : "1";
    div.style.cursor       = "crosshair";
    div.style.border       = `3px solid ${joueur.couleur}`;
    div.style.borderRadius = "50%";
    div.style.boxSizing    = "border-box";

    // --- Label : nom ---
    const label = document.createElement("div");
    label.style.cssText = `
        position: absolute; top: -52px; left: 50%;
        transform: translateX(-50%); text-align: center;
        white-space: nowrap; pointer-events: none;
    `;
    const nomDiv = document.createElement("div");
    nomDiv.textContent      = joueur.nomJoueur;
    nomDiv.style.fontWeight = "bold";
    nomDiv.style.color      = joueur.couleur;
    nomDiv.style.fontSize   = "12px";
    nomDiv.style.textShadow = "1px 1px 2px black";

    // --- Barre de PV ---
    const pvWrapper = document.createElement("div");
    pvWrapper.style.cssText = `
        position: relative; width: 60px; height: 10px;
        background: #444; border-radius: 5px; overflow: hidden;
        margin-top: 2px;
    `;
    const pvBar = document.createElement("div");
    pvBar.style.cssText = `
        height: 100%; border-radius: 5px;
        background: linear-gradient(90deg, #e74c3c, #ff6b6b);
        transition: width 0.15s ease;
    `;
    const pvRatio = joueur.pv / joueur.pvMax;
    pvBar.style.width = (pvRatio * 100) + "%";
    // Couleur de la barre selon les PV restants
    pvBar.style.background = pvRatio > 0.5
        ? "linear-gradient(90deg, #2ecc71, #27ae60)"
        : pvRatio > 0.25
            ? "linear-gradient(90deg, #f39c12, #e67e22)"
            : "linear-gradient(90deg, #e74c3c, #ff6b6b)";

    const pvText = document.createElement("div");
    pvText.textContent = `${joueur.pv}/${joueur.pvMax}`;
    pvText.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%;
        text-align: center; font-size: 8px; line-height: 10px;
        color: white; text-shadow: 0 0 2px black;
        pointer-events: none;
    `;

    pvWrapper.appendChild(pvBar);
    pvWrapper.appendChild(pvText);
    label.appendChild(nomDiv);
    label.appendChild(pvWrapper);
    div.appendChild(label);

    // --- Indicateur "MOI" centré ---
    if (joueur.id === monId) {
        const moi = document.createElement("div");
        moi.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 9px; color: #00ffff;
            font-weight: bold; pointer-events: none;
            text-shadow: 0 0 4px #00ffff;
        `;
        moi.textContent = "●";
        div.appendChild(moi);
        div.style.border = "3px solid #00ffff";
    }

    arena.appendChild(div);
    elementsDuJeu[joueur.id] = { div, pvBar, pvText, pvWrapper };
}

function mettreAJourPersonnage(joueur) {
    const el = elementsDuJeu[joueur.id];
    if (!el) return;
    const { div, pvBar, pvText } = el;

    div.style.left    = joueur.x + "px";
    div.style.top     = joueur.y + "px";
    div.style.opacity = joueur.pv <= 0 ? "0.3" : "1";

    // Mise à jour barre PV
    const pvRatio = Math.max(0, joueur.pv / joueur.pvMax);
    pvBar.style.width = (pvRatio * 100) + "%";
    pvBar.style.background = pvRatio > 0.5
        ? "linear-gradient(90deg, #2ecc71, #27ae60)"
        : pvRatio > 0.25
            ? "linear-gradient(90deg, #f39c12, #e67e22)"
            : "linear-gradient(90deg, #e74c3c, #ff6b6b)";
    pvText.textContent = `${joueur.pv}/${joueur.pvMax}`;

    // Bouclier actif : halo bleu + bordure
    if (joueur.bouclierActif) {
        div.style.boxShadow = "0 0 16px 4px #00aaff, 0 0 4px #00aaff inset";
        div.style.border    = "3px solid #00aaff";
    } else if (joueur.boostActif) {
        div.style.boxShadow = "0 0 12px 3px #ff8800";
        div.style.border    = `3px solid ${joueur.couleur}`;
    } else {
        div.style.boxShadow = "";
        div.style.border    = joueur.id === monId ? "3px solid #00ffff" : `3px solid ${joueur.couleur}`;
    }
}

function supprimerElementPersonnage(id) {
    const el = elementsDuJeu[id];
    if (el) { el.div.remove(); delete elementsDuJeu[id]; }
}

//==============================================
// PROJECTILES
//==============================================
function creerElementProjectile(proj) {
    const div = document.createElement("div");
    div.dataset.projId = proj.id;
    const diameter = proj.taille * 2;
    div.style.cssText = `
        position: absolute;
        width: ${diameter}px; height: ${diameter}px;
        border-radius: 50%;
        background: ${proj.couleur};
        box-shadow: 0 0 8px ${proj.couleur};
        pointer-events: none; z-index: 5;
        transform: translate(-50%, -50%);
    `;
    div.style.left = proj.x + "px";
    div.style.top  = proj.y + "px";
    arena.appendChild(div);
    elementsProjets[proj.id] = div;
}
function supprimerElementProjectile(id) {
    const div = elementsProjets[id];
    if (div) { div.remove(); delete elementsProjets[id]; }
}

//==============================================
// ZONES D'ATTAQUE (SVG)
//==============================================
function creerElementZone(zone) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = `
        position: absolute; left: 0; top: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 4; overflow: visible;
    `;
    const el = document.createElementNS("http://www.w3.org/2000/svg", zone.forme === "laser" ? "polygon" : "path");
    el.setAttribute("fill",         hexToRgba(zone.couleur, 0.45));
    el.setAttribute("stroke",       zone.couleur);
    el.setAttribute("stroke-width", "2");

    if      (zone.forme === "arc")       el.setAttribute("d",      tracerArc(zone));
    else if (zone.forme === "laser")     el.setAttribute("points", tracerLaser(zone));
    else if (zone.forme === "cercle")    el.setAttribute("d",      tracerCercle(zone));
    else if (zone.forme === "meteorite") el.setAttribute("d",      tracerCerclePoint(zone));

    svg.appendChild(el);
    arena.appendChild(svg);
    const timeout = setTimeout(() => supprimerElementZone(zone.id), zone.dureeAffichage ?? 500);
    elementesZones[zone.id] = { svg, timeout };
}
function supprimerElementZone(id) {
    const el = elementesZones[id];
    if (el) { clearTimeout(el.timeout); el.svg.remove(); delete elementesZones[id]; }
}

function tracerArc(zone) {
    const { tireurX: ox, tireurY: oy, dirX, dirY, rayon, angleOuverture } = zone;
    const demi = angleOuverture * Math.PI / 180;
    const angleBase = Math.atan2(dirY, dirX);
    const x1 = ox + Math.cos(angleBase - demi) * rayon;
    const y1 = oy + Math.sin(angleBase - demi) * rayon;
    const x2 = ox + Math.cos(angleBase + demi) * rayon;
    const y2 = oy + Math.sin(angleBase + demi) * rayon;
    const largeArc = (angleOuverture * 2) > 180 ? 1 : 0;
    return `M ${ox} ${oy} L ${x1} ${y1} A ${rayon} ${rayon} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
function tracerLaser(zone) {
    const { tireurX: ox, tireurY: oy, dirX, dirY, longueur, largeur } = zone;
    const perpX = -dirY, perpY = dirX, demi = largeur / 2;
    const p1x = ox + perpX * demi, p1y = oy + perpY * demi;
    const p2x = ox - perpX * demi, p2y = oy - perpY * demi;
    const p3x = p2x + dirX * longueur, p3y = p2y + dirY * longueur;
    const p4x = p1x + dirX * longueur, p4y = p1y + dirY * longueur;
    return `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`;
}
function tracerCercle(zone) {
    const { tireurX: cx, tireurY: cy, rayon: r } = zone;
    return `M ${cx-r} ${cy} A ${r} ${r} 0 1 0 ${cx+r} ${cy} A ${r} ${r} 0 1 0 ${cx-r} ${cy} Z`;
}
function tracerCerclePoint(zone) {
    const { cibleX: cx, cibleY: cy, rayon: r } = zone;
    return `M ${cx-r} ${cy} A ${r} ${r} 0 1 0 ${cx+r} ${cy} A ${r} ${r} 0 1 0 ${cx-r} ${cy} Z`;
}
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

//==============================================
// HUD — 3 cases (attaque1, attaque2, attaque3)
//==============================================
const hud = document.createElement("div");
hud.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 12px; z-index: 200; pointer-events: none;
`;
document.body.appendChild(hud);

function creerCaseHud(id, label, touche) {
    const wrapper = document.createElement("div");
    wrapper.id = id;
    wrapper.style.cssText = `
        position: relative; width: 68px; height: 68px;
        background: rgba(0,0,0,0.75); border: 2px solid #555;
        border-radius: 10px; display: flex; align-items: center;
        justify-content: center; flex-direction: column; color: white;
        font-family: Arial; text-align: center;
    `;
    const overlay = document.createElement("div");
    overlay.className = "cd-overlay";
    overlay.style.cssText = `
        position: absolute; bottom: 0; left: 0; width: 100%; height: 0%;
        background: rgba(0,0,0,0.65); border-radius: 8px;
    `;
    const labelDiv = document.createElement("div");
    labelDiv.className = "cd-label";
    labelDiv.textContent = label;
    labelDiv.style.cssText = "position:relative;z-index:1;font-size:9px;padding:2px 4px;";
    const toucheDiv = document.createElement("div");
    toucheDiv.textContent = touche;
    toucheDiv.style.cssText = "position:absolute;bottom:3px;right:5px;font-size:10px;color:#aaa;z-index:1;";
    wrapper.appendChild(overlay);
    wrapper.appendChild(labelDiv);
    wrapper.appendChild(toucheDiv);
    hud.appendChild(wrapper);
    return wrapper;
}

const hudAttaque1 = creerCaseHud("hud-atq1", "—", "🖱 G");
const hudAttaque2 = creerCaseHud("hud-atq2", "—", "🖱 D");
const hudAttaque3 = creerCaseHud("hud-atq3", "—", "Espace");

const activeCooldowns = {};

function afficherCooldown(hudEl, nomAttaque, cooldownMs) {
    if (activeCooldowns[nomAttaque]) clearInterval(activeCooldowns[nomAttaque]);
    const overlay = hudEl.querySelector(".cd-overlay");
    const start   = Date.now();
    hudEl.style.borderColor = "#555";
    hudEl.style.boxShadow   = "";
    activeCooldowns[nomAttaque] = setInterval(() => {
        const ratio = Math.min((Date.now() - start) / cooldownMs, 1);
        overlay.style.height = (100 - ratio * 100) + "%";
        if (ratio >= 1) {
            clearInterval(activeCooldowns[nomAttaque]);
            overlay.style.height = "0%";
            pulserPret(hudEl);
        }
    }, 50);
}

function pulserPret(hudEl) {
    let count = 0;
    const iv = setInterval(() => {
        hudEl.style.borderColor = count % 2 === 0 ? "#00ff88" : "#555";
        hudEl.style.boxShadow   = count % 2 === 0 ? "0 0 10px #00ff88" : "";
        count++;
        if (count >= 6) {
            clearInterval(iv);
            hudEl.style.borderColor = "#00ff88";
            hudEl.style.boxShadow   = "0 0 6px #00ff88";
        }
    }, 120);
}

// Bouclier héro : animation d'une barre de durée sur la case
function afficherDureeBouclier(dureeMax) {
    if (activeCooldowns["bouclier_duree"]) clearInterval(activeCooldowns["bouclier_duree"]);
    const overlay = hudAttaque2.querySelector(".cd-overlay");
    const start   = Date.now();
    hudAttaque2.style.borderColor = "#00aaff";
    hudAttaque2.style.boxShadow   = "0 0 10px #00aaff";
    // Ici l'overlay se remplit (bouclier qui se vide)
    activeCooldowns["bouclier_duree"] = setInterval(() => {
        const ratio = Math.min((Date.now() - start) / dureeMax, 1);
        overlay.style.height = (ratio * 100) + "%"; // grandit vers le haut = durée qui s'épuise
        if (ratio >= 1) clearInterval(activeCooldowns["bouclier_duree"]);
    }, 50);
}

//==============================================
// MISE À JOUR AFFICHAGE
//==============================================
socket.on("game_state", ({ joueurs, projectiles, zones }) => {
    const idsPresents = new Set(joueurs.map(j => j.id));
    for (const id of Object.keys(elementsDuJeu)) {
        if (!idsPresents.has(id)) supprimerElementPersonnage(id);
    }
    for (const joueur of joueurs) {
        if (!elementsDuJeu[joueur.id]) creerElementPersonnage(joueur);
        mettreAJourPersonnage(joueur);
        if (joueur.id === monId) {
            maPosition   = { x: joueur.x, y: joueur.y };
            cameraOffset = mettreAJourCamera(joueur.x, joueur.y);
        }
    }

    const projIds = new Set(projectiles.map(p => p.id));
    for (const id of Object.keys(elementsProjets)) {
        if (!projIds.has(Number(id))) supprimerElementProjectile(id);
    }
    for (const proj of projectiles) {
        if (!elementsProjets[proj.id]) creerElementProjectile(proj);
        else { const d = elementsProjets[proj.id]; d.style.left = proj.x+"px"; d.style.top = proj.y+"px"; }
    }

    const zoneIds = new Set(zones.map(z => z.id));
    for (const zone of zones) { if (!elementesZones[zone.id]) creerElementZone(zone); }
    for (const id of Object.keys(elementesZones)) {
        if (!zoneIds.has(Number(id))) supprimerElementZone(id);
    }
});

socket.on("joueur_elimine", ({ victimeId, tueurNom, victimeNom }) => {
    afficherNotification(`⚔️ ${tueurNom} a éliminé ${victimeNom} !`);
    const el = elementsDuJeu[victimeId];
    if (el) el.div.style.opacity = "0.3";
});
socket.on("joueur_parti", ({ id }) => supprimerElementPersonnage(id));
socket.on("erreur",       ({ message }) => alert("Erreur : " + message));

socket.on("attaque_ok", ({ attaque, cooldown }) => {
    // Clé unique par attaque — empêche deux setInterval pour la même case
    const map = { attaque1: hudAttaque1, attaque2: hudAttaque2, attaque3: hudAttaque3 };
    const hudEl = map[attaque];
    if (hudEl) afficherCooldown(hudEl, attaque, cooldown);
});

socket.on("cooldown_actif", ({ attaque }) => {
    const map = { attaque1: hudAttaque1, attaque2: hudAttaque2, attaque3: hudAttaque3 };
    const hudEl = map[attaque];
    if (!hudEl) return;
    hudEl.style.borderColor = "#e74c3c";
    hudEl.style.boxShadow   = "0 0 8px #e74c3c";
    setTimeout(() => { hudEl.style.borderColor = ""; hudEl.style.boxShadow = ""; }, 300);
});

// Bouclier héro : confirmation activation
socket.on("bouclier_etat", ({ actif, dureeMax, cooldown }) => {
    if (actif) {
        afficherDureeBouclier(dureeMax);
    } else {
        afficherCooldown(hudAttaque2, "attaque2", cooldown);
    }
});

//==============================================
// CONNEXION
//==============================================
socket.on("rejoindre_ok", ({ monId: id, attaques }) => {
    monId       = id;
    mesAttaques = attaques;
    if (attaques?.attaque1) hudAttaque1.querySelector(".cd-label").textContent = attaques.attaque1.label;
    if (attaques?.attaque2) hudAttaque2.querySelector(".cd-label").textContent = attaques.attaque2.label;
    if (attaques?.attaque3) hudAttaque3.querySelector(".cd-label").textContent = attaques.attaque3.label;
    console.log("Connecté, mon ID :", monId);
});

//==============================================
// NOTIFICATION
//==============================================
function afficherNotification(texte) {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
        border-radius: 8px; font-size: 16px; z-index: 100;
        border: 1px solid #e74c3c; pointer-events: none;
    `;
    notif.textContent = texte;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

//==============================================
// TOUCHES
//==============================================
document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    // Espace → attaque3 (déplacement)
    // e.repeat bloque les répétitions automatiques du navigateur quand la touche est maintenue
    if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return; // une seule émission par appui physique
        // Envoie la direction de la souris comme fallback si aucune touche n'est enfoncée.
        // Le serveur utilise les touches ZQSD en priorité et n'utilise dirX/dirY
        // que si aucune touche n'est enfoncée — donc cette valeur est un fallback valide.
        const dir = calculerDirectionDepuisMoi(derniereCursorX, derniereCursorY);
        if (dir) socket.emit("attaque3", dir);
        // NE PAS lancer afficherCooldown ici : on attend attaque_ok du serveur
        return;
    }

    if (!keys[key]) { keys[key] = true; socket.emit("keys_update", { keys }); }
});

document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === " ") return;
    keys[key] = false;
    socket.emit("keys_update", { keys });
});

//==============================================
// CLICS
//==============================================
function ecranVersArene(ex, ey) {
    return { x: ex - cameraOffset.camX, y: ey - cameraOffset.camY };
}
function calculerDirectionDepuisMoi(ecranX, ecranY) {
    if (!monId || !maPosition) return null;
    const persoX = maPosition.x + CHAR_SIZE / 2;
    const persoY = maPosition.y + CHAR_SIZE / 2;
    const cible  = ecranVersArene(ecranX, ecranY);
    const dx = cible.x - persoX, dy = cible.y - persoY;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return null;
    return { dirX: dx/len, dirY: dy/len, cibleX: cible.x, cibleY: cible.y };
}

// Clic gauche → attaque1
document.addEventListener("click", (e) => {
    const dir = calculerDirectionDepuisMoi(e.clientX, e.clientY);
    if (!dir) return;
    socket.emit("attaque1", dir);
});

// Clic droit maintenu → bouclier héro / attaque2 autres classes
document.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    const dir = calculerDirectionDepuisMoi(e.clientX, e.clientY);
    if (!dir) return;

    if (mesAttaques?.attaque2?.type === "bouclier") {
        bouclierMaintenu = true;
        socket.emit("bouclier_activer");
    } else {
        socket.emit("attaque2", dir);
    }
});

document.addEventListener("mouseup", (e) => {
    if (e.button !== 2) return;
    if (bouclierMaintenu) {
        bouclierMaintenu = false;
        socket.emit("bouclier_desactiver");
    }
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

//==============================================
// DÉCONNEXION
//==============================================
const btnDeco = document.querySelector("#btnDeco");
if (btnDeco) {
    btnDeco.addEventListener("click", () => {
        socket.disconnect();
        window.location.href = "../index.html";
    });
}

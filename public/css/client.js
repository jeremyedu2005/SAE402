const socket = io();

//==============================================
// ÉTAT LOCAL
//==============================================
let monId            = null;
let mesAttaques      = null;
let maPosition       = null;
let monEquipe        = null;
let bouclierMaintenu = false;

const elementsDuJeu   = {};
const elementsProjets = {};
const elementesZones            = {};
const elementesZonesPersistantes = {}; // id -> div
const elementesTelegraphes       = {}; // id -> { svg, path }
const keys            = {};

//==============================================
// CONSTANTES
//==============================================
const CHAR_SIZE    = 50;
const ARENA_WIDTH  = 2500;
const ARENA_HEIGHT = 2500;
const MINIMAP_W    = 200;
const MINIMAP_H    = Math.round(MINIMAP_W * ARENA_HEIGHT / ARENA_WIDTH);
const MINIMAP_PAD  = 12;

//==============================================
// CAMÉRA
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
let cameraOffset    = { camX: 0, camY: 0 };
let derniereCursorX = 0;
let derniereCursorY = 0;
document.addEventListener("mousemove", (e) => {
    derniereCursorX = e.clientX;
    derniereCursorY = e.clientY;
});

//==============================================
// MINIMAP
//==============================================
const minimapCanvas  = document.createElement("canvas");
minimapCanvas.width  = MINIMAP_W;
minimapCanvas.height = MINIMAP_H;
minimapCanvas.style.cssText = `
    position: fixed; top: ${MINIMAP_PAD}px; left: ${MINIMAP_PAD}px;
    z-index: 300; border: 1px solid rgba(255,255,255,0.25);
    border-radius: 6px; background: rgba(0,0,0,0.5);
    pointer-events: none;
`;
document.body.appendChild(minimapCanvas);
const minimapCtx = minimapCanvas.getContext("2d");

function dessinerMinimap(joueurs) {
    minimapCtx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    minimapCtx.fillStyle = "rgba(0,0,0,0.35)";
    minimapCtx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    for (const joueur of joueurs) {
        const mx     = ((joueur.x + CHAR_SIZE / 2) / ARENA_WIDTH)  * MINIMAP_W;
        const my     = ((joueur.y + CHAR_SIZE / 2) / ARENA_HEIGHT) * MINIMAP_H;
        const estMoi = joueur.id === monId;
        const couleur = estMoi ? "#ffffff"
            : joueur.equipe === monEquipe ? "#4fc3f7" : "#ef5350";
        const rayon = estMoi ? 4 : 3;

        minimapCtx.shadowColor = couleur;
        minimapCtx.shadowBlur  = estMoi ? 6 : 3;
        minimapCtx.beginPath();
        minimapCtx.arc(mx, my, rayon, 0, Math.PI * 2);
        minimapCtx.fillStyle = couleur;
        minimapCtx.fill();
        if (estMoi) {
            minimapCtx.strokeStyle = "rgba(255,255,255,0.6)";
            minimapCtx.lineWidth   = 1;
            minimapCtx.stroke();
        }
        minimapCtx.shadowBlur = 0;
    }
}

//==============================================
// CHAT
//==============================================
const CHAT_MAX_MSG = 200;
let   chatMinimise = false;
const CHAT_TOP     = MINIMAP_PAD + MINIMAP_H + 10;

const chatContainer = document.createElement("div");
chatContainer.style.cssText = `
    position: fixed; top: ${CHAT_TOP}px; left: ${MINIMAP_PAD}px;
    width: ${MINIMAP_W}px; z-index: 300;
    font-family: Arial, sans-serif; font-size: 11px;
    pointer-events: all; user-select: none;
`;

const chatHeader = document.createElement("div");
chatHeader.style.cssText = `
    background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px 6px 0 0; padding: 4px 8px; color: #ccc;
    cursor: pointer; display: flex; justify-content: space-between;
    align-items: center; font-size: 11px;
`;
const chatTitre = document.createElement("span");
chatTitre.textContent = "💬 Chat";
const chatToggle = document.createElement("span");
chatToggle.textContent = "▼";
chatToggle.style.fontSize = "9px";
chatHeader.appendChild(chatTitre);
chatHeader.appendChild(chatToggle);

const chatMessages = document.createElement("div");
chatMessages.style.cssText = `
    background: rgba(0,0,0,0.55);
    border-left: 1px solid rgba(255,255,255,0.15);
    border-right: 1px solid rgba(255,255,255,0.15);
    height: 140px; overflow-y: auto; padding: 5px 7px;
    display: flex; flex-direction: column; gap: 3px;
    scroll-behavior: smooth; scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.2) transparent;
`;

const chatInputRow = document.createElement("div");
chatInputRow.style.cssText = `
    display: flex; border: 1px solid rgba(255,255,255,0.2);
    border-top: none; border-radius: 0 0 6px 6px; overflow: hidden;
    background: rgba(0,0,0,0.7);
`;
const chatInput = document.createElement("input");
chatInput.type        = "text";
chatInput.placeholder = "Écrire un message…";
chatInput.maxLength   = 200;
chatInput.style.cssText = `
    flex: 1; background: transparent; border: none; outline: none;
    color: white; font-size: 11px; padding: 5px 7px; font-family: Arial;
`;
const chatBtn = document.createElement("button");

chatBtn.style.cssText = `
    background: rgba(255,255,255,0.08); border: none;
    border-left: 1px solid rgba(255,255,255,0.15);
    color: #ccc; padding: 0 9px; cursor: pointer; font-size: 13px;
`;
chatInputRow.appendChild(chatInput);
chatInputRow.appendChild(chatBtn);

chatContainer.appendChild(chatHeader);
chatContainer.appendChild(chatMessages);
chatContainer.appendChild(chatInputRow);
document.body.appendChild(chatContainer);

chatHeader.addEventListener("click", () => {
    chatMinimise = !chatMinimise;
    chatMessages.style.display    = chatMinimise ? "none" : "flex";
    chatInputRow.style.display    = chatMinimise ? "none" : "flex";
    chatToggle.textContent        = chatMinimise ? "▶" : "▼";
    chatHeader.style.borderRadius = chatMinimise ? "6px" : "6px 6px 0 0";
});

// Isole les touches du jeu pendant la saisie
chatInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") envoyerMessage();
});
chatInput.addEventListener("keyup", (e) => e.stopPropagation());
chatBtn.addEventListener("click", () => { envoyerMessage(); chatInput.focus(); });

function envoyerMessage() {
    const texte = chatInput.value.trim();
    if (!texte || !monId) return;
    socket.emit("chat_message", { texte });
    chatInput.value = "";
}

function ajouterMessage({ nomJoueur, couleur, texte, timestamp }) {
    const ligne = document.createElement("div");
    ligne.style.cssText = "display:flex; gap:4px; flex-wrap:wrap; word-break:break-word;";

    const h = new Date(timestamp);
    const hs = h.getHours().toString().padStart(2,"0") + ":" + h.getMinutes().toString().padStart(2,"0");

    const heureSpan = document.createElement("span");
    heureSpan.textContent = hs;
    heureSpan.style.cssText = "color:rgba(255,255,255,0.3); flex-shrink:0;";

    const nomSpan = document.createElement("span");
    nomSpan.textContent = nomJoueur + " :";
    nomSpan.style.cssText = `color:${couleur}; font-weight:bold; flex-shrink:0;`;

    const texteSpan = document.createElement("span");
    texteSpan.textContent = texte;
    texteSpan.style.color = "#e0e0e0";

    ligne.appendChild(heureSpan);
    ligne.appendChild(nomSpan);
    ligne.appendChild(texteSpan);
    chatMessages.appendChild(ligne);

    while (chatMessages.children.length > CHAT_MAX_MSG) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Nouveau message en temps réel
socket.on("chat_message", (msg) => ajouterMessage(msg));

// Historique reçu à la (re)connexion — vide d'abord pour éviter les doublons
socket.on("chat_historique", (messages) => {
    chatMessages.innerHTML = "";
    messages.forEach(msg => ajouterMessage(msg));
});

//==============================================
// PERSONNAGES
//==============================================
function creerElementPersonnage(joueur) {
    const div = document.createElement("div");
    div.className      = `character ${joueur.classe}`;
    div.dataset.id     = joueur.id;
    div.style.left         = joueur.x + "px";
    div.style.top          = joueur.y + "px";
    div.style.opacity      = joueur.pv <= 0 ? "0.3" : "1";
    div.style.cursor       = "crosshair";
    div.style.border       = `3px solid ${joueur.couleur}`;
    div.style.borderRadius = "50%";
    div.style.boxSizing    = "border-box";

    const label = document.createElement("div");
    label.style.cssText = `
        position: absolute; top: -52px; left: 50%;
        transform: translateX(-50%); text-align: center;
        white-space: nowrap; pointer-events: none;
        display: flex; flex-direction: column; align-items: center;
    `;
    const nomDiv = document.createElement("div");
    nomDiv.textContent      = joueur.nomJoueur;
    nomDiv.style.fontWeight = "bold";
    nomDiv.style.color      = joueur.couleur;
    nomDiv.style.fontSize   = "12px";
    nomDiv.style.textShadow = "1px 1px 2px black";

    const pvWrapper = document.createElement("div");
    pvWrapper.style.cssText = `
        position: relative; width: 60px; height: 10px;
        background: #444; border-radius: 5px; overflow: hidden; margin-top: 2px;
    `;
    const pvBar = document.createElement("div");
    pvBar.style.height       = "100%";
    pvBar.style.borderRadius = "5px";
    pvBar.style.transition   = "width 0.15s ease";
    const pvRatio = joueur.pv / joueur.pvMax;
    pvBar.style.width      = (pvRatio * 100) + "%";
    pvBar.style.background = pvRatio > 0.5 ? "linear-gradient(90deg,#2ecc71,#27ae60)"
        : pvRatio > 0.25 ? "linear-gradient(90deg,#f39c12,#e67e22)"
        : "linear-gradient(90deg,#e74c3c,#ff6b6b)";

    const pvText = document.createElement("div");
    pvText.textContent = `${joueur.pv}/${joueur.pvMax}`;
    pvText.style.cssText = `
        position:absolute; top:0; left:0; width:100%;
        text-align:center; font-size:8px; line-height:10px;
        color:white; text-shadow:0 0 2px black; pointer-events:none;
    `;
    pvWrapper.appendChild(pvBar);
    pvWrapper.appendChild(pvText);
    label.appendChild(nomDiv);
    label.appendChild(pvWrapper);
    div.appendChild(label);

    if (joueur.id === monId) {
        const moi = document.createElement("div");
        moi.style.cssText = `
            position:absolute; top:50%; left:50%;
            transform:translate(-50%,-50%);
            font-size:9px; color:#00ffff; font-weight:bold;
            pointer-events:none; text-shadow:0 0 4px #00ffff;
        `;
        moi.textContent = "●";
        div.appendChild(moi);
        div.style.border = "3px solid #00ffff";
    }

    arena.appendChild(div);
    elementsDuJeu[joueur.id] = { div, pvBar, pvText };
}

function mettreAJourPersonnage(joueur) {
    const el = elementsDuJeu[joueur.id];
    if (!el) return;
    const { div, pvBar, pvText } = el;

    div.style.left = joueur.x + "px";
    div.style.top  = joueur.y + "px";

    const pvRatio = Math.max(0, joueur.pv / joueur.pvMax);
    pvBar.style.width      = (pvRatio * 100) + "%";
    pvBar.style.background = pvRatio > 0.5 ? "linear-gradient(90deg,#2ecc71,#27ae60)"
        : pvRatio > 0.25 ? "linear-gradient(90deg,#f39c12,#e67e22)"
        : "linear-gradient(90deg,#e74c3c,#ff6b6b)";
    pvText.textContent = `${joueur.pv}/${joueur.pvMax}`;

    if (joueur.dashActif) {
        div.style.opacity   = "0.55";
        div.style.filter    = "brightness(1.6)";
        div.style.boxShadow = `0 0 20px 6px ${joueur.dashCouleur||"#fff"}, 0 0 6px ${joueur.dashCouleur||"#fff"} inset`;
        div.style.border    = `3px solid ${joueur.dashCouleur||"#fff"}`;
    } else if (joueur.bouclierActif) {
        div.style.opacity   = "1";
        div.style.filter    = "";
        div.style.boxShadow = "0 0 16px 4px #00aaff, 0 0 4px #00aaff inset";
        div.style.border    = "3px solid #00aaff";
    } else if (joueur.boostActif) {
        div.style.opacity   = "1";
        div.style.filter    = "";
        div.style.boxShadow = "0 0 12px 3px #ff8800";
        div.style.border    = `3px solid ${joueur.couleur}`;
    } else {
        div.style.opacity   = joueur.pv <= 0 ? "0.3" : "1";
        div.style.filter    = "";
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
    const frameH = proj.taille * 4;

    if (proj.sprite) {
        div.style.cssText = `
            position:absolute; width:${frameH}px; height:${frameH}px;
            background-image:url('../sprites/${proj.sprite}');
            background-repeat:no-repeat; pointer-events:none; z-index:5;
            transform:translate(-50%,-50%);
        `;
        if (proj.sprite === "bouledefeu.png") {
            // Spritesheet animée 3 frames
            div.classList.add("sprite-animation");
        } else if (proj.sprite === "pluiedefleches.png") {
            // Sprite statique orienté selon la direction du tir
            div.style.backgroundSize     = "contain";
            div.style.backgroundPosition = "center";
            div.style.backgroundRepeat   = "no-repeat";
        } else {
            div.style.backgroundSize     = "contain";
            div.style.backgroundPosition = "center";
        }
    } else {
        div.style.cssText = `
            position:absolute; width:${frameH}px; height:${frameH}px;
            border-radius:50%; background:${proj.couleur};
            box-shadow:0 0 8px ${proj.couleur};
            pointer-events:none; z-index:5; transform:translate(-50%,-50%);
        `;
    }
    if (proj.dirX !== undefined) {
        const angle = Math.atan2(proj.dirY, proj.dirX) * 180 / Math.PI;
        div.style.transform += ` rotate(${angle}deg)`;
    }
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
// ZONES (SVG)
//==============================================
function creerElementZone(zone) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = `
        position:absolute; left:0; top:0; width:100%; height:100%;
        pointer-events:none; z-index:4; overflow:visible;
    `;
    const tag = zone.forme === "laser" ? "polygon" : "path";
    const el  = document.createElementNS("http://www.w3.org/2000/svg", tag);
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
function tracerArc(z) {
    const b = Math.atan2(z.dirY, z.dirX), d = z.angleOuverture * Math.PI / 180;
    const x1=z.tireurX+Math.cos(b-d)*z.rayon, y1=z.tireurY+Math.sin(b-d)*z.rayon;
    const x2=z.tireurX+Math.cos(b+d)*z.rayon, y2=z.tireurY+Math.sin(b+d)*z.rayon;
    return `M ${z.tireurX} ${z.tireurY} L ${x1} ${y1} A ${z.rayon} ${z.rayon} 0 ${z.angleOuverture*2>180?1:0} 1 ${x2} ${y2} Z`;
}
function tracerLaser(z) {
    const px=-z.dirY, py=z.dirX, d=z.largeur/2;
    const p1x=z.tireurX+px*d,p1y=z.tireurY+py*d, p2x=z.tireurX-px*d,p2y=z.tireurY-py*d;
    const p3x=p2x+z.dirX*z.longueur,p3y=p2y+z.dirY*z.longueur;
    const p4x=p1x+z.dirX*z.longueur,p4y=p1y+z.dirY*z.longueur;
    return `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`;
}
function tracerCercle(z) {
    return `M ${z.tireurX-z.rayon} ${z.tireurY} A ${z.rayon} ${z.rayon} 0 1 0 ${z.tireurX+z.rayon} ${z.tireurY} A ${z.rayon} ${z.rayon} 0 1 0 ${z.tireurX-z.rayon} ${z.tireurY} Z`;
}
function tracerCerclePoint(z) {
    return `M ${z.cibleX-z.rayon} ${z.cibleY} A ${z.rayon} ${z.rayon} 0 1 0 ${z.cibleX+z.rayon} ${z.cibleY} A ${z.rayon} ${z.rayon} 0 1 0 ${z.cibleX-z.rayon} ${z.cibleY} Z`;
}
function hexToRgba(hex, a) {
    return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
}

//==============================================
// ZONES PERSISTANTES (brûlure, etc.)
//==============================================
function creerElementZonePersistante(zp) {
    const div = document.createElement("div");
    div.dataset.zpId = zp.id;
    const diameter = zp.rayon * 2;
    div.style.cssText = `
        position: absolute;
        width: ${diameter}px; height: ${diameter}px;
        border-radius: 50%;
        background: radial-gradient(circle, ${zp.couleur}88 0%, ${zp.couleur}22 70%, transparent 100%);
        border: 2px solid ${zp.couleur};
        pointer-events: none; z-index: 3;
        transform: translate(-50%, -50%);
        transition: opacity 0.3s ease;
    `;
    div.style.left = zp.x + "px";
    div.style.top  = zp.y + "px";
    div.style.opacity = zp.ratioRestant ?? 1;
    arena.appendChild(div);
    elementesZonesPersistantes[zp.id] = div;
}
function supprimerElementZonePersistante(id) {
    const div = elementesZonesPersistantes[id];
    if (div) { div.remove(); delete elementesZonesPersistantes[id]; }
}

//==============================================
// TÉLÉGRAPHES (indicateurs d'impact)
// Affichés avec un contour clignotant et un remplissage qui se remplit
// selon la progression du délai.
//==============================================
function creerElementTelegraphe(tg) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = `
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 6; overflow: visible;
    `;

    // Fond semi-transparent (progression)
    const fill = document.createElementNS("http://www.w3.org/2000/svg", tg.forme === "laser" ? "polygon" : "path");
    fill.setAttribute("fill",   hexToRgba(tg.couleur, 0.15));
    fill.setAttribute("stroke", "none");

    // Contour clignotant
    const contour = document.createElementNS("http://www.w3.org/2000/svg", tg.forme === "laser" ? "polygon" : "path");
    contour.setAttribute("fill",         "none");
    contour.setAttribute("stroke",       tg.couleur);
    contour.setAttribute("stroke-width", "3");
    contour.setAttribute("stroke-dasharray", "10 6");
    contour.style.animation = "telegraphe-cligno 0.35s linear infinite";

    const pathData   = calculerPathTelegraphe(tg);
    if (tg.forme === "laser") {
        fill.setAttribute("points",    pathData);
        contour.setAttribute("points", pathData);
    } else {
        fill.setAttribute("d",    pathData);
        contour.setAttribute("d", pathData);
    }

    svg.appendChild(fill);
    svg.appendChild(contour);
    arena.appendChild(svg);
    elementesTelegraphes[tg.id] = { svg, fill, contour };
}

function mettreAJourTelegraphe(tg) {
    const el = elementesTelegraphes[tg.id];
    if (!el) return;
    // Augmente l'opacité du fond selon la progression
    el.fill.setAttribute("fill", hexToRgba(tg.couleur, 0.05 + tg.ratio * 0.3));
}

function supprimerElementTelegraphe(id) {
    const el = elementesTelegraphes[id];
    if (el) { el.svg.remove(); delete elementesTelegraphes[id]; }
}

function calculerPathTelegraphe(tg) {
    // Réutilise les mêmes fonctions de tracé que les zones
    const zone = { ...tg };
    if      (tg.forme === "arc")       return tracerArc(zone);
    else if (tg.forme === "laser")     return tracerLaser(zone);
    else if (tg.forme === "cercle")    return tracerCercle(zone);
    else if (tg.forme === "meteorite") return tracerCerclePoint(zone);
    return "";
}

// Injecte le keyframe CSS pour le clignotement une seule fois
(function injecterAnimTelegraphe() {
    if (document.getElementById("style-telegraphe")) return;
    const style = document.createElement("style");
    style.id = "style-telegraphe";
    style.textContent = `
        @keyframes telegraphe-cligno {
            0%   { opacity: 1; }
            50%  { opacity: 0.25; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
})();

//==============================================
// HUD
//==============================================
const hud = document.createElement("div");
hud.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;z-index:200;pointer-events:none;";
document.body.appendChild(hud);

function creerCaseHud(id, label, touche) {
    const w = document.createElement("div");
    w.id = id;
    w.style.cssText = `
        position:relative; width:68px; height:68px;
        background:rgba(0,0,0,0.75); border:2px solid #00ff88;
        border-radius:10px; display:flex; align-items:center;
        justify-content:center; flex-direction:column; color:white;
        font-family:Arial; text-align:center;
    `;
    const ov = document.createElement("div");
    ov.className = "cd-overlay";
    ov.style.cssText = "position:absolute;bottom:0;left:0;width:100%;height:0%;background:rgba(0,0,0,0.65);border-radius:8px;";
    const lb = document.createElement("div");
    lb.className = "cd-label"; lb.textContent = label;
    lb.style.cssText = "position:relative;z-index:1;font-size:9px;padding:2px 4px;";
    const tk = document.createElement("div");
    tk.textContent = touche;
    tk.style.cssText = "position:absolute;bottom:3px;right:5px;font-size:10px;color:#aaa;z-index:1;";
    w.appendChild(ov); w.appendChild(lb); w.appendChild(tk);
    hud.appendChild(w);
    return w;
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
        if (++count >= 6) {
            clearInterval(iv);
            hudEl.style.borderColor = "#00ff88";
            hudEl.style.boxShadow   = "0 0 6px #00ff88";
        }
    }, 120);
}

function afficherDureeBouclier(dureeMax) {
    if (activeCooldowns["bouclier_duree"]) clearInterval(activeCooldowns["bouclier_duree"]);
    const overlay = hudAttaque2.querySelector(".cd-overlay");
    const start   = Date.now();
    hudAttaque2.style.borderColor = "#00aaff";
    hudAttaque2.style.boxShadow   = "0 0 10px #00aaff";
    activeCooldowns["bouclier_duree"] = setInterval(() => {
        const ratio = Math.min((Date.now() - start) / dureeMax, 1);
        overlay.style.height = (ratio * 100) + "%";
        if (ratio >= 1) clearInterval(activeCooldowns["bouclier_duree"]);
    }, 50);
}

//==============================================
// SOCKET — affichage
//==============================================
socket.on("game_state", ({ joueurs, projectiles, zones, zonesPersistantes, telegraphes }) => {
    dessinerMinimap(joueurs);

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
        if (!elementsProjets[proj.id]) {
            creerElementProjectile(proj);
        } else {
            const d = elementsProjets[proj.id];
            d.style.left = proj.x + "px";
            d.style.top  = proj.y + "px";
            if (proj.dirX !== undefined) {
                const angle = Math.atan2(proj.dirY, proj.dirX) * 180 / Math.PI;
                d.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
            }
        }
    }

    const zoneIds = new Set(zones.map(z => z.id));
    for (const zone of zones) { if (!elementesZones[zone.id]) creerElementZone(zone); }
    for (const id of Object.keys(elementesZones)) {
        if (!zoneIds.has(Number(id))) supprimerElementZone(id);
    }

    // Télégraphes
    const tgIds = new Set((telegraphes || []).map(t => t.id));
    for (const tg of (telegraphes || [])) {
        if (!elementesTelegraphes[tg.id]) creerElementTelegraphe(tg);
        else mettreAJourTelegraphe(tg);
    }
    for (const id of Object.keys(elementesTelegraphes)) {
        if (!tgIds.has(Number(id))) supprimerElementTelegraphe(id);
    }

    // Zones persistantes
    const zpIds = new Set((zonesPersistantes || []).map(z => z.id));
    for (const zp of (zonesPersistantes || [])) {
        if (!elementesZonesPersistantes[zp.id]) {
            creerElementZonePersistante(zp);
        } else {
            // Met à jour l'opacité selon le temps restant
            elementesZonesPersistantes[zp.id].style.opacity = zp.ratioRestant ?? 1;
        }
    }
    for (const id of Object.keys(elementesZonesPersistantes)) {
        if (!zpIds.has(Number(id))) supprimerElementZonePersistante(id);
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
    const map = { attaque1: hudAttaque1, attaque2: hudAttaque2, attaque3: hudAttaque3 };
    if (map[attaque]) afficherCooldown(map[attaque], attaque, cooldown);
});
socket.on("cooldown_actif", ({ attaque }) => {
    const map = { attaque1: hudAttaque1, attaque2: hudAttaque2, attaque3: hudAttaque3 };
    const hudEl = map[attaque];
    if (!hudEl) return;
    hudEl.style.borderColor = "#e74c3c";
    hudEl.style.boxShadow   = "0 0 8px #e74c3c";
    setTimeout(() => { hudEl.style.borderColor = ""; hudEl.style.boxShadow = ""; }, 300);
});
socket.on("bouclier_etat", ({ actif, dureeMax, cooldown }) => {
    if (actif) afficherDureeBouclier(dureeMax);
    else       afficherCooldown(hudAttaque2, "attaque2", cooldown);
});
socket.on("dash_debut", ({ couleur }) => {
    if (!monId || !elementsDuJeu[monId]) return;
    const { div } = elementsDuJeu[monId];
    div.style.opacity   = "0.55";
    div.style.filter    = "brightness(1.6)";
    div.style.boxShadow = `0 0 20px 6px ${couleur}, 0 0 6px ${couleur} inset`;
    div.style.border    = `3px solid ${couleur}`;
});
socket.on("dash_fin", () => {});

socket.on("rejoindre_ok", ({ monId: id, attaques, perso }) => {
    monId       = id;
    mesAttaques = attaques;
    monEquipe   = perso?.equipe ?? null;
    if (attaques?.attaque1) hudAttaque1.querySelector(".cd-label").textContent = attaques.attaque1.label;
    if (attaques?.attaque2) hudAttaque2.querySelector(".cd-label").textContent = attaques.attaque2.label;
    if (attaques?.attaque3) hudAttaque3.querySelector(".cd-label").textContent = attaques.attaque3.label;
    console.log("Connecté :", monId, "équipe :", monEquipe);
});

//==============================================
// NOTIFICATION
//==============================================
function afficherNotification(texte) {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position:fixed; top:20px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.8); color:white; padding:10px 20px;
        border-radius:8px; font-size:16px; z-index:100;
        border:1px solid #e74c3c; pointer-events:none;
    `;
    notif.textContent = texte;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

//==============================================
// TOUCHES
//==============================================
document.addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) return;
    if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        const dir = calculerDirectionDepuisMoi(derniereCursorX, derniereCursorY);
        if (dir) socket.emit("attaque3", dir);
        return;
    }
    const key = e.key.toLowerCase();
    if (!keys[key]) { keys[key] = true; socket.emit("keys_update", { keys }); }
});
document.addEventListener("keyup", (e) => {
    if (document.activeElement === chatInput) return;
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

document.addEventListener("click", (e) => {
    if (document.activeElement === chatInput) return;
    const dir = calculerDirectionDepuisMoi(e.clientX, e.clientY);
    if (!dir) return;
    socket.emit("attaque1", dir);
});
document.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    if (document.activeElement === chatInput) return;
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

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
// CONFIG SPRITESHEETS DE PERSONNAGES
// frameW/H   : dimensions d'une frame dans le fichier source
// frames     : nombre de frames d'animation (run)
// fps        : vitesse d'animation pendant le déplacement
// spriteSize : taille affichée à l'écran (carré)
// fichier    : chemin sous sprites/
// Toutes les spritesheets sont orientées vers la droite.
// Le sprite est retourné horizontalement (scaleX(-1)) si facingX < 0.
//==============================================
const PERSONNAGE_SPRITES = {
    archer: {
        fichier:    "../sprites/Personnages/archer-run.png",
        frameW:     170,   // largeur d'une frame source
        frameH:     171,   // hauteur de la spritesheet source
        frames:     6,
        fps:        10,
        spriteSize: 80,    // taille affichée (px) — peut différer de CHAR_SIZE
    },
    mage_feu: {
        fichier:    "../sprites/Personnages/fireMage-run.png",
        frameW:     170,   // largeur d'une frame source
        frameH:     171,   // hauteur de la spritesheet source
        frames:     6,
        fps:        10,
        spriteSize: 80,    // taille affichée (px) — peut différer de CHAR_SIZE
    },
    hero: {
        fichier:    "../sprites/Personnages/knight-run.png",
        frameW:     170,   // largeur d'une frame source
        frameH:     171,   // hauteur de la spritesheet source
        frames:     6,
        fps:        10,
        spriteSize: 80,    // taille affichée (px) — peut différer de CHAR_SIZE
    },
    goblin: {
        fichier:    "../sprites/Personnages/gobelin-run.png",
        frameW:     170,   // largeur d'une frame source
        frameH:     171,   // hauteur de la spritesheet source
        frames:     5,
        fps:        10,
        spriteSize: 80,    // taille affichée (px) — peut différer de CHAR_SIZE
    },
    // Autres classes à ajouter ici quand les sprites seront disponibles :
    // hero:     { fichier: "sprites/Personnages/Hero/hero-run.png", ... },
    // mage_feu: { ... },
};

// Stocke les intervalles d'animation par joueur id
const animIntervals = {};

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
    const conf = PERSONNAGE_SPRITES[joueur.classe];
    const div = document.createElement("div");
    div.className      = `character ${joueur.classe}`;
    div.dataset.id     = joueur.id;
    div.style.left     = joueur.x + "px";
    div.style.top      = joueur.y + "px";
    div.style.opacity  = joueur.pv <= 0 ? "0.3" : "1";
    div.style.cursor   = "crosshair";
    div.style.position = "absolute";

    if (conf) {
        // Sprite : cssText = complet pour écraser les styles de .character de jeu.css
        const bgW = conf.frames * conf.spriteSize;
        div.style.cssText = `
            position: absolute;
            left: ${joueur.x}px;
            top:  ${joueur.y}px;
            width:  ${conf.spriteSize}px;
            height: ${conf.spriteSize}px;
            background-image: url('../sprites/${conf.fichier}');
            background-size: ${bgW}px ${conf.spriteSize}px;
            background-repeat: no-repeat;
            background-position: 0px 0px;
            background-color: transparent;
            border: none;
            border-radius: 50%;
            box-shadow: none;
            image-rendering: pixelated;
            cursor: crosshair;
            opacity: ${joueur.pv <= 0 ? "0.3" : "1"};
        `;
        div.dataset.frame    = "0";
        div.dataset.facingX  = "1";
        div.dataset.isMoving = "0";
    } else {
        // Placeholder cercle coloré
        div.style.border       = `3px solid ${joueur.couleur}`;
        div.style.borderRadius = "50%";
        div.style.boxSizing    = "border-box";
        div.style.width        = CHAR_SIZE + "px";
        div.style.height       = CHAR_SIZE + "px";
    }

    const label = document.createElement("div");
    label.style.cssText = `
        position: absolute; top: -52px; left: 50%;
        transform: translateX(-50%); text-align: center;
        white-space: nowrap; pointer-events: none;
        display: flex; flex-direction: column; align-items: center;
    `;
    label.dataset.baseTransform = "translateX(-50%)";
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
        if (!conf) div.style.border = "3px solid #00ffff";
    }

    arena.appendChild(div);
    elementsDuJeu[joueur.id] = { div, pvBar, pvText, conf, label };
}

function animerPersonnage(id, conf) {
    // Lance ou arrête l'interval d'animation selon isMoving
    const el = elementsDuJeu[id];
    if (!el || !conf) return;
    const { div } = el;

    const wasMoving = div.dataset.isMoving === "1";
    const isMoving  = joueur => joueur; // juste pour clarté, appelé plus bas

    // Appelé depuis mettreAJourPersonnage avec les bonnes valeurs
}

function appliquerFrameSprite(div, conf, frame, facingX) {
    const offsetX = frame * conf.spriteSize;
    div.style.backgroundPosition = `-${offsetX}px 0px`;
    // Retourne uniquement le background du div (le sprite)
    // en utilisant scaleX sur le div, puis contre-inverser chaque enfant
    // pour que nom, PV et "●" restent dans le bon sens.
    div.style.transform = facingX < 0 ? "scaleX(-1)" : "scaleX(1)";
    // Contre-inverser chaque enfant en préservant son transform original
    for (const child of div.children) {
        // Lire le transform de base stocké au moment de la création
        const base = child.dataset.baseTransform ?? child.style.transform ?? "";
        // Enlever tout scaleX précédent pour repartir proprement
        const clean = base.replace(/\s*scaleX\([^)]*\)/g, "").trim();
        child.style.transform = facingX < 0 ? (clean ? clean + " scaleX(-1)" : "scaleX(-1)") : clean;
    }
}

function mettreAJourPersonnage(joueur) {
    const el = elementsDuJeu[joueur.id];
    if (!el) return;
    const { div, pvBar, pvText, conf } = el;

    div.style.left = joueur.x + "px";
    div.style.top  = joueur.y + "px";

    // --- Animation sprite ---
    if (conf) {
        const facingX  = joueur.facingX  ?? 1;
        // Détection locale pour mon personnage : le serveur ne broadcast pas quand on s'arrête
        const isMoving = joueur.id === monId
            ? !!(keys["z"] || keys["s"] || keys["q"] || keys["d"])
            : (joueur.isMoving ?? false);
        const prevFacing = parseInt(div.dataset.facingX ?? "1");

        // Toujours mettre à jour la direction (même à l'arrêt)
        if (facingX !== prevFacing) {
            div.dataset.facingX = String(facingX);
            const frame = parseInt(div.dataset.frame ?? "0");
            appliquerFrameSprite(div, conf, frame, facingX);
        }

        // Démarre la boucle d'animation si pas encore active.
        // La boucle tourne en permanence et lit keys[] directement —
        // elle est totalement indépendante du serveur.
        if (!animIntervals[joueur.id]) {
            let frame = 0;
            animIntervals[joueur.id] = setInterval(() => {
                if (!div.isConnected) {
                    clearInterval(animIntervals[joueur.id]);
                    delete animIntervals[joueur.id];
                    return;
                }
                const fx = parseInt(div.dataset.facingX ?? "1");
                const estMonPersonnage = div.dataset.id === monId;
                const bouge = estMonPersonnage
                    ? !!(keys["z"] || keys["s"] || keys["q"] || keys["d"])
                    : div.dataset.isMoving === "1"; // autres joueurs : mis à jour par serveur
                if (bouge) {
                    frame = (frame + 1) % conf.frames;
                } else {
                    frame = 0; // idle : reste sur frame 0
                }
                div.dataset.frame = String(frame);
                appliquerFrameSprite(div, conf, frame, fx);
            }, 1000 / conf.fps);
        }
        // Mettre à jour isMoving pour les autres joueurs (depuis le serveur)
        if (joueur.id !== monId) {
            div.dataset.isMoving = joueur.isMoving ? "1" : "0";
        }
    }

    const pvRatio = Math.max(0, joueur.pv / joueur.pvMax);
    pvBar.style.width      = (pvRatio * 100) + "%";
    pvBar.style.background = pvRatio > 0.5 ? "linear-gradient(90deg,#2ecc71,#27ae60)"
        : pvRatio > 0.25 ? "linear-gradient(90deg,#f39c12,#e67e22)"
        : "linear-gradient(90deg,#e74c3c,#ff6b6b)";
    pvText.textContent = `${joueur.pv}/${joueur.pvMax}`;

    // Effets visuels selon état — border uniquement pour les cercles (pas les sprites)
    if (joueur.dashActif) {
        div.style.opacity   = "0.55";
        div.style.filter    = "brightness(1.6)";
        div.style.boxShadow = `0 0 20px 6px ${joueur.dashCouleur||"#fff"}, 0 0 6px ${joueur.dashCouleur||"#fff"} inset`;
        if (!conf) div.style.border = `3px solid ${joueur.dashCouleur||"#fff"}`;
    } else if (joueur.bouclierActif) {
        div.style.opacity   = "1";
        div.style.filter    = "";
        div.style.boxShadow = "0 0 16px 4px #00aaff, 0 0 4px #00aaff inset";
        if (!conf) div.style.border = "3px solid #00aaff";
    } else if (joueur.boostActif) {
        div.style.opacity   = "1";
        div.style.filter    = "";
        div.style.boxShadow = "0 0 12px 3px #ff8800";
        if (!conf) div.style.border = `3px solid ${joueur.couleur}`;
    } else {
        div.style.opacity   = joueur.pv <= 0 ? "0.3" : "1";
        // Ralenti (goblin) : teinte violette
        div.style.filter    = joueur.ralentiActif ? "hue-rotate(270deg) brightness(0.85)" : "";
        div.style.boxShadow = joueur.ralentiActif ? "0 0 10px 3px #aa44ff" : "";
        if (conf) {
            div.style.border       = "none";
            div.style.borderRadius = "50%";
        } else {
            div.style.border = joueur.id === monId ? "3px solid #00ffff" : `3px solid ${joueur.couleur}`;
        }
    }
}

function supprimerElementPersonnage(id) {
    const el = elementsDuJeu[id];
    if (el) {
        clearInterval(animIntervals[id]);
        delete animIntervals[id];
        el.div.remove();
        delete elementsDuJeu[id];
    }
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
// Sprites à afficher pour certaines zones (centrés sur le point d'impact)
const ZONE_SPRITES = {
    meteorite: { fichier: "pluiedefleches.png", taille: 350 },
};

function creerElementZone(zone) {
    const spriteConf = ZONE_SPRITES[zone.forme];
    let svg = null;
    let spriteDiv = null;

    if (spriteConf) {
        // Zones avec sprite : PNG uniquement, pas de SVG (le télégraphe a déjà montré la zone)
        spriteDiv = document.createElement("div");
        const cx = zone.forme === "meteorite" ? zone.cibleX : zone.tireurX;
        const cy = zone.forme === "meteorite" ? zone.cibleY : zone.tireurY;
        spriteDiv.style.cssText = `
            position: absolute;
            width: ${spriteConf.taille}px; height: ${spriteConf.taille}px;
            background-image: url('../sprites/${spriteConf.fichier}');
            background-size: contain; background-repeat: no-repeat;
            background-position: center;
            pointer-events: none; z-index: 5;
            transform: translate(-50%, -50%);
            image-rendering: pixelated;
        `;
        spriteDiv.style.left = cx + "px";
        spriteDiv.style.top  = cy + "px";
        arena.appendChild(spriteDiv);
    } else {
        // Zones sans sprite : SVG classique
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
    }

    const timeout = setTimeout(() => supprimerElementZone(zone.id), zone.dureeAffichage ?? 500);
    elementesZones[zone.id] = { svg, spriteDiv, timeout };
}
function supprimerElementZone(id) {
    const el = elementesZones[id];
    if (el) {
        clearTimeout(el.timeout);
        if (el.svg)       el.svg.remove();
        if (el.spriteDiv) el.spriteDiv.remove();
        delete elementesZones[id];
    }
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

    const pathData = calculerPathTelegraphe(tg);
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

//==============================================
// SCOREBOARD
//==============================================
const SCORE_VICTOIRE = 5;

const scoreboard = document.createElement("div");
scoreboard.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 0;
    background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px; padding: 8px 20px; z-index: 300;
    font-family: 'Orbitron', Arial, sans-serif; pointer-events: none;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
`;

const scoreBlue = document.createElement("div");
scoreBlue.style.cssText = `
    color: #4fc3f7; font-size: 22px; font-weight: 900;
    min-width: 32px; text-align: right; letter-spacing: 1px;
`;
scoreBlue.textContent = "0";

const scoreSep = document.createElement("div");
scoreSep.style.cssText = `
    color: rgba(255,255,255,0.3); font-size: 18px;
    padding: 0 14px; font-weight: 400;
`;
scoreSep.textContent = "—";

const scoreRed = document.createElement("div");
scoreRed.style.cssText = `
    color: #ef5350; font-size: 22px; font-weight: 900;
    min-width: 32px; text-align: left; letter-spacing: 1px;
`;
scoreRed.textContent = "0";

// Barres de progression sous les scores
const barContainer = document.createElement("div");
barContainer.style.cssText = `
    position: absolute; bottom: 0; left: 10px; right: 10px; height: 3px;
    display: flex; border-radius: 0 0 12px 12px; overflow: hidden;
`;
const barBlue = document.createElement("div");
barBlue.style.cssText = `height: 100%; background: #4fc3f7; transition: width 0.4s ease; width: 0%;`;
const barGap  = document.createElement("div");
barGap.style.cssText  = `height: 100%; background: transparent; width: 4px; flex-shrink: 0;`;
const barRed  = document.createElement("div");
barRed.style.cssText  = `height: 100%; background: #ef5350; transition: width 0.4s ease; width: 0%;`;
barContainer.appendChild(barBlue);
barContainer.appendChild(barGap);
barContainer.appendChild(barRed);

scoreboard.appendChild(scoreBlue);
scoreboard.appendChild(scoreSep);
scoreboard.appendChild(scoreRed);
scoreboard.appendChild(barContainer);
document.body.appendChild(scoreboard);

function mettreAJourScore(scores) {
    if (!scores) return;
    const b = scores.blue ?? 0;
    const r = scores.red  ?? 0;
    console.log("[Score UI] blue =", b, "red =", r, "| scoreBlue el =", scoreBlue, "scoreRed el =", scoreRed);
    scoreBlue.textContent = b;
    scoreRed.textContent  = r;
    const maxBar = 45;
    barBlue.style.width = ((b / SCORE_VICTOIRE) * maxBar) + "%";
    barRed.style.width  = ((r / SCORE_VICTOIRE) * maxBar) + "%";
}

//==============================================
// ÉCRAN FIN DE PARTIE (VICTOIRE / DEFAITE)
//==============================================
let overlayFinPartie = null;

function afficherEcranFin(estVainqueur, equipeGagnante, scores) {
    if (overlayFinPartie) overlayFinPartie.remove();

    const couleurVic  = "#4fc3f7"; // toujours bleu clair pour la victoire
    const couleurDef  = equipeGagnante === "blue" ? "#ef5350" : "#4fc3f7"; // couleur équipe perdante
    const couleur     = estVainqueur ? couleurVic : couleurDef;
    const nomGagnant  = equipeGagnante === "blue" ? "EQUIPE BLEUE" : "EQUIPE ROUGE";
    const nomPerdant  = equipeGagnante === "blue" ? "EQUIPE ROUGE" : "EQUIPE BLEUE";

    overlayFinPartie = document.createElement("div");
    overlayFinPartie.style.cssText = `
        position: fixed; inset: 0; z-index: 600;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Orbitron', Arial, sans-serif;
        pointer-events: all;
        background: radial-gradient(ellipse at center, ${couleur}18 0%, rgba(0,0,0,0.95) 65%);
    `;

    // Titre
    const titre = document.createElement("div");
    titre.textContent = estVainqueur ? "VICTOIRE" : "DEFAITE";
    titre.style.cssText = `
        font-size: 80px; font-weight: 900; letter-spacing: 10px;
        margin-bottom: 10px;
        color: ${couleur};
        text-shadow: 0 0 40px ${couleur}99, 0 0 80px ${couleur}44;
        animation: fin-pulse 1.2s ease-in-out infinite alternate;
    `;

    // Sous-titre
    const sous = document.createElement("div");
    sous.textContent = estVainqueur
        ? nomGagnant + " REMPORTE LA PARTIE"
        : nomPerdant + " A GAGNE";
    sous.style.cssText = `
        font-size: 13px; font-weight: 400; letter-spacing: 4px;
        color: rgba(255,255,255,0.5);
        margin-bottom: 52px;
    `;

    // Scores
    const scoresDiv = document.createElement("div");
    scoresDiv.style.cssText = `
        display: flex; margin-bottom: 52px;
        border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
        overflow: hidden;
    `;
    const blueBox = document.createElement("div");
    blueBox.style.cssText = `
        padding: 18px 44px; text-align: center;
        background: rgba(79,195,247,0.08);
        border-right: 1px solid rgba(255,255,255,0.08);
    `;
    blueBox.innerHTML = `<div style="color:#4fc3f7;font-size:10px;letter-spacing:3px;margin-bottom:8px;">BLEU</div>
                         <div style="color:white;font-size:40px;font-weight:900;">${scores.blue}</div>`;
    const redBox = document.createElement("div");
    redBox.style.cssText = `
        padding: 18px 44px; text-align: center;
        background: rgba(239,83,80,0.08);
    `;
    redBox.innerHTML = `<div style="color:#ef5350;font-size:10px;letter-spacing:3px;margin-bottom:8px;">ROUGE</div>
                        <div style="color:white;font-size:40px;font-weight:900;">${scores.red}</div>`;
    scoresDiv.appendChild(blueBox);
    scoresDiv.appendChild(redBox);

    // Bouton
    const btn = document.createElement("button");
    btn.textContent = "RETOUR AU MENU";
    btn.style.cssText = `
        position: static !important;
        display: block;
        background: transparent;
        color: ${couleur};
        border: 2px solid ${couleur};
        border-radius: 8px; padding: 14px 48px;
        font-size: 13px; font-weight: 700; letter-spacing: 4px;
        font-family: 'Orbitron', Arial, sans-serif;
        cursor: pointer; transition: background 0.2s, color 0.2s;
        margin: 0;
    `;
    btn.addEventListener("mouseenter", () => {
        btn.style.background = couleur;
        btn.style.color = "black";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
        btn.style.color = couleur;
    });
    btn.addEventListener("click", () => redirectMenu());

    // Compte à rebours auto
    const countdown = document.createElement("div");
    countdown.style.cssText = `margin-top:18px; color:rgba(255,255,255,0.2); font-size:10px; letter-spacing:2px;`;
    let restant = 10;
    countdown.textContent = `REDIRECTION DANS ${restant}S`;
    const iv = setInterval(() => {
        restant--;
        countdown.textContent = `REDIRECTION DANS ${restant}S`;
        if (restant <= 0) { clearInterval(iv); redirectMenu(); }
    }, 1000);

    // Animation CSS
    if (!document.getElementById("style-fin")) {
        const s = document.createElement("style");
        s.id = "style-fin";
        s.textContent = `@keyframes fin-pulse { from { opacity:0.8; } to { opacity:1; } }`;
        document.head.appendChild(s);
    }

    overlayFinPartie.appendChild(titre);
    overlayFinPartie.appendChild(sous);
    overlayFinPartie.appendChild(scoresDiv);
    overlayFinPartie.appendChild(btn);
    overlayFinPartie.appendChild(countdown);
    document.body.appendChild(overlayFinPartie);
}

function redirectMenu() {
    socket.disconnect();
    localStorage.removeItem("nomJoueur");
    localStorage.removeItem("classeChoisie");
    localStorage.removeItem("equipeChoisie");
    window.location.href = "../index.html";
}

function cacherFinPartie() {
    if (overlayFinPartie) { overlayFinPartie.remove(); overlayFinPartie = null; }
}

//==============================================
// ÉCRAN DE MORT
//==============================================
let overlayMort = null;

function afficherEcranMort(tueurNom) {
    if (overlayMort) overlayMort.remove();

    overlayMort = document.createElement("div");
    overlayMort.style.cssText = `
        position: fixed; inset: 0; z-index: 450;
        background: rgba(0,0,0,0.72);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Orbitron', Arial, sans-serif;
    `;

    // Titre ÉLIMINÉ
    const titre = document.createElement("div");
    titre.textContent = "💀 ÉLIMINÉ";
    titre.style.cssText = `
        color: #ef5350; font-size: 48px; font-weight: 900;
        text-shadow: 0 0 30px #ef535088;
        margin-bottom: 10px; letter-spacing: 4px;
        animation: mort-pulse 0.6s ease-in-out infinite alternate;
    `;

    const sous = document.createElement("div");
    sous.textContent = tueurNom ? `Par ${tueurNom}` : "";
    sous.style.cssText = `
        color: rgba(255,255,255,0.5); font-size: 16px;
        margin-bottom: 40px; letter-spacing: 1px;
    `;

    // Bouton RÉAPPARAÎTRE
    const btn = document.createElement("button");
    btn.textContent = "⚔️ RÉAPPARAÎTRE";
    btn.style.cssText = `
        background: linear-gradient(135deg, #e74c3c, #c0392b);
        color: white; border: none; border-radius: 10px;
        padding: 16px 40px; font-size: 18px; font-weight: 700;
        font-family: 'Orbitron', Arial, sans-serif;
        cursor: pointer; letter-spacing: 2px;
        box-shadow: 0 0 20px #e74c3c88;
        transition: transform 0.1s, box-shadow 0.1s;
    `;
    btn.addEventListener("mouseenter", () => {
        btn.style.transform  = "scale(1.05)";
        btn.style.boxShadow  = "0 0 30px #e74c3ccc";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.transform  = "scale(1)";
        btn.style.boxShadow  = "0 0 20px #e74c3c88";
    });
    btn.addEventListener("click", () => {
        socket.emit("demande_respawn");
    });

    // Injecte animation CSS
    if (!document.getElementById("style-mort")) {
        const s = document.createElement("style");
        s.id = "style-mort";
        s.textContent = `
            @keyframes mort-pulse {
                from { text-shadow: 0 0 20px #ef535066; }
                to   { text-shadow: 0 0 50px #ef5350, 0 0 80px #ef535055; }
            }
        `;
        document.head.appendChild(s);
    }

    overlayMort.appendChild(titre);
    overlayMort.appendChild(sous);
    overlayMort.appendChild(btn);
    document.body.appendChild(overlayMort);
}

function cacherEcranMort() {
    if (overlayMort) { overlayMort.remove(); overlayMort = null; }
}

const activeCooldowns = {};

function arreterClignotementDoubleDash() {
    if (activeCooldowns["double_dash_fenetre_iv"]) {
        clearInterval(activeCooldowns["double_dash_fenetre_iv"]);
        delete activeCooldowns["double_dash_fenetre_iv"];
    }
}

function afficherCooldown(hudEl, nomAttaque, cooldownMs) {
    if (activeCooldowns[nomAttaque]) clearInterval(activeCooldowns[nomAttaque]);
    // Si c'est l'attaque3, arrêter aussi le clignotement du double dash
    if (nomAttaque === "attaque3") arreterClignotementDoubleDash();
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
socket.on("game_state", ({ joueurs, projectiles, zones, zonesPersistantes, telegraphes, scores }) => {
    if (scores) mettreAJourScore(scores);
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

socket.on("joueur_elimine", ({ victimeId, tueurNom, victimeNom, scores }) => {
    afficherNotificationKill(tueurNom, victimeNom, scores);
    if (scores) mettreAJourScore(scores);
    const el = elementsDuJeu[victimeId];
    if (el) el.div.style.opacity = "0.3";
    // Si c'est moi qui suis mort → affiche l'écran de mort
    if (victimeId === monId) afficherEcranMort(tueurNom);
});
socket.on("joueur_parti", ({ id }) => supprimerElementPersonnage(id));
socket.on("erreur",       ({ message }) => alert("Erreur : " + message));

socket.on("tu_es_mort", () => {
    // Sécurité : affiche l'écran si pas encore visible
    if (!overlayMort) afficherEcranMort(null);
});

socket.on("respawn", () => {
    cacherEcranMort();
    if (monId && elementsDuJeu[monId]) {
        elementsDuJeu[monId].div.style.opacity = "1";
    }
});

socket.on("partie_terminee", ({ equipeGagnante, scores }) => {
    mettreAJourScore(scores);
    cacherEcranMort(); // cache l'écran de mort si le joueur était mort
    const estVainqueur = (monEquipe === equipeGagnante);
    afficherEcranFin(estVainqueur, equipeGagnante, scores);
});

socket.on("partie_reset", () => {
    // Plus utilisé — la redirection se fait côté client
});

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
// Double dash : fenêtre ouverte → case HUD clignote pour indiquer qu'on peut relancer
socket.on("double_dash_pret", () => {
    // Le 1er dash vient de se terminer : la case est "prête" pour le 2e
    // On annule tout cooldown en cours sur la case et on la fait clignoter
    if (activeCooldowns["attaque3"]) {
        clearInterval(activeCooldowns["attaque3"]);
        delete activeCooldowns["attaque3"];
    }
    hudAttaque3.querySelector(".cd-overlay").style.height = "0%";
    // Clignotement cyan rapide = fenêtre active
    let count = 0;
    const iv = setInterval(() => {
        hudAttaque3.style.borderColor = count % 2 === 0 ? "#00ffee" : "#44ff44";
        hudAttaque3.style.boxShadow   = count % 2 === 0 ? "0 0 12px #00ffee" : "0 0 12px #44ff44";
        count++;
    }, 150);
    activeCooldowns["double_dash_fenetre_iv"] = iv;
});

socket.on("double_dash_fenetre_expiree", () => {
    arreterClignotementDoubleDash();
    hudAttaque3.style.borderColor = "#555";
    hudAttaque3.style.boxShadow   = "";
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
        position:fixed; top:70px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.8); color:white; padding:10px 20px;
        border-radius:8px; font-size:14px; z-index:100;
        border:1px solid #e74c3c; pointer-events:none;
        white-space: nowrap;
    `;
    notif.textContent = texte;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function afficherNotificationKill(tueurNom, victimeNom, scores) {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.85); color: white;
        padding: 10px 18px; border-radius: 10px; font-size: 14px;
        z-index: 400; border: 1px solid #e74c3c; pointer-events: none;
        display: flex; flex-direction: column; align-items: center; gap: 5px;
        white-space: nowrap;
    `;

    const ligne1 = document.createElement("div");
    ligne1.textContent = `⚔️ ${tueurNom} a éliminé ${victimeNom} !`;
    ligne1.style.fontWeight = "bold";

    notif.appendChild(ligne1);

    if (scores) {
        const ligne2 = document.createElement("div");
        ligne2.style.cssText = "display:flex; gap:16px; font-size:13px; opacity:0.9;";

        const blueSpan = document.createElement("span");
        blueSpan.style.color = "#4fc3f7";
        blueSpan.textContent = `🔵 Bleu : ${scores.blue}`;

        const redSpan = document.createElement("span");
        redSpan.style.color = "#ef5350";
        redSpan.textContent = `🔴 Rouge : ${scores.red}`;

        ligne2.appendChild(blueSpan);
        ligne2.appendChild(redSpan);
        notif.appendChild(ligne2);
    }

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
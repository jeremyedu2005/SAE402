const socket = io();

//==============================================
// ÉTAT LOCAL
//==============================================
let monId = null;
const elementsDuJeu = {}; // socketId -> { div, labelDiv, pvBarDiv }
const keys = {};
let showRange = false;
const CHAR_SIZE = 80;

//==============================================
// ÉLÉMENTS HTML
//==============================================
const arena = document.querySelector(".arena");

// Cercle de portée
const rangeDisplay = document.createElement("div");
rangeDisplay.style.cssText = `
    position: absolute; border-radius: 50%;
    border: 2px solid #00ffff; pointer-events: none;
    opacity: 0.4; display: none; z-index: 1;
`;
arena.appendChild(rangeDisplay);

//==============================================
// CRÉATION / SUPPRESSION DES PERSONNAGES
//==============================================
function creerElementPersonnage(joueur) {
    const div = document.createElement("div");
    div.className = `character ${joueur.classe}`;
    div.dataset.id = joueur.id;
    div.style.left = joueur.x + "px";
    div.style.top = joueur.y + "px";
    div.style.backgroundColor = joueur.couleur;
    div.style.borderRadius = "50%";
    div.style.opacity = joueur.pv <= 0 ? "0.3" : "1";

    // Label : nom + PV
    const label = document.createElement("div");
    label.className = "label-joueur";
    label.style.cssText = `
        position: absolute; top: -45px; left: 50%;
        transform: translateX(-50%); text-align: center;
        font-size: 12px; white-space: nowrap; color: white;
        text-shadow: 1px 1px 2px black;
    `;

    const nomDiv = document.createElement("div");
    nomDiv.textContent = joueur.nomJoueur;
    nomDiv.style.fontWeight = "bold";
    nomDiv.style.color = joueur.couleur;

    const pvDiv = document.createElement("div");
    pvDiv.textContent = `PV: ${joueur.pv}/${joueur.pvMax}`;
    pvDiv.style.fontSize = "11px";

    label.appendChild(nomDiv);
    label.appendChild(pvDiv);
    div.appendChild(label);

    // Indicateur "MOI"
    if (joueur.id === monId) {
        const moi = document.createElement("div");
        moi.style.cssText = `
            position: absolute; bottom: -20px; left: 50%;
            transform: translateX(-50%); font-size: 10px;
            color: #00ffff; font-weight: bold;
        `;
        moi.textContent = "▲ MOI";
        div.appendChild(moi);
        div.style.border = "2px solid #00ffff";
    }

    arena.appendChild(div);

    elementsDuJeu[joueur.id] = { div, pvDiv };
}

function supprimerElementPersonnage(id) {
    const el = elementsDuJeu[id];
    if (el) {
        el.div.remove();
        delete elementsDuJeu[id];
    }
}

//==============================================
// MISE À JOUR DE L'AFFICHAGE
//==============================================
socket.on("game_state", ({ joueurs }) => {
    const idsPresents = new Set(joueurs.map((j) => j.id));

    // Supprimer les éléments des joueurs partis
    for (const id of Object.keys(elementsDuJeu)) {
        if (!idsPresents.has(id)) supprimerElementPersonnage(id);
    }

    // Créer ou mettre à jour chaque joueur
    for (const joueur of joueurs) {
        if (!elementsDuJeu[joueur.id]) {
            creerElementPersonnage(joueur);
        }

        const { div, pvDiv } = elementsDuJeu[joueur.id];
        div.style.left = joueur.x + "px";
        div.style.top = joueur.y + "px";
        div.style.opacity = joueur.pv <= 0 ? "0.3" : "1";
        pvDiv.textContent = `PV: ${joueur.pv}/${joueur.pvMax}`;

        // Mise à jour du cercle de portée pour MOI
        if (joueur.id === monId && showRange) {
            rangeDisplay.style.display = "block";
            const diameter = joueur.range * 2;
            rangeDisplay.style.width = diameter + "px";
            rangeDisplay.style.height = diameter + "px";
            rangeDisplay.style.left = (joueur.x + CHAR_SIZE / 2 - joueur.range) + "px";
            rangeDisplay.style.top = (joueur.y + CHAR_SIZE / 2 - joueur.range) + "px";
        }
    }

    if (!showRange) rangeDisplay.style.display = "none";
});

socket.on("joueur_elimine", ({ victimeId, tueurNom, victimeNom }) => {
    afficherNotification(`⚔️ ${tueurNom} a éliminé ${victimeNom} !`);
    const el = elementsDuJeu[victimeId];
    if (el) el.div.style.opacity = "0.3";
});

socket.on("joueur_parti", ({ id }) => {
    supprimerElementPersonnage(id);
});

socket.on("hors_de_portee", ({ distance, range }) => {
    console.log(`Hors de portée ! Distance: ${distance}px, Portée: ${range}px`);
});

socket.on("erreur", ({ message }) => {
    alert("Erreur : " + message);
});

//==============================================
// CONNEXION — reçoit l'ID et le personnage
//==============================================
socket.on("rejoindre_ok", ({ monId: id }) => {
    monId = id;
    console.log("Connecté, mon ID :", monId);
});

//==============================================
// NOTIFICATION EN JEU
//==============================================
function afficherNotification(texte) {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
        border-radius: 8px; font-size: 16px; z-index: 100;
        border: 1px solid #e74c3c;
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
    if (!keys[key]) {
        keys[key] = true;
        socket.emit("keys_update", { keys });
    }
    if (e.key === "Shift") showRange = true;
});

document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    socket.emit("keys_update", { keys });
    if (e.key === "Shift") {
        showRange = false;
        rangeDisplay.style.display = "none";
    }
});

//==============================================
// ATTAQUES — clic sur un personnage ennemi
//==============================================
arena.addEventListener("mousedown", (e) => {
    const cibleDiv = e.target.closest(".character");
    if (!cibleDiv) return;

    const cibleId = cibleDiv.dataset.id;
    if (cibleId === monId) return; // ne peut pas s'attaquer soi-même

    if (e.button === 0) socket.emit("attaque", { cibleId });
    if (e.button === 2) socket.emit("attaque_speciale", { cibleId });
});


document.querySelector("#btnDeco", () => socket.emit("disconnect"))

document.addEventListener("contextmenu", (e) => e.preventDefault());

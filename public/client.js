const socket = io();

//==============================================
// RÉCUPÉRATION DES ÉLÉMENTS HTML
//==============================================
const heroDiv = document.querySelector("#hero");
const mageDiv = document.querySelector("#mage");
const heroPV = document.querySelector("#heroPV");
const magePV = document.querySelector("#magePV");

//==============================================
// AFFICHAGE DE LA PORTÉE D'ATTAQUE
//==============================================
const rangeDisplay = document.createElement("div");
rangeDisplay.style.position = "absolute";
rangeDisplay.style.borderRadius = "50%";
rangeDisplay.style.border = "2px solid #00ffff";
rangeDisplay.style.pointerEvents = "none";
rangeDisplay.style.opacity = "0.5";
rangeDisplay.style.display = "none";
rangeDisplay.style.zIndex = "1";
document.querySelector(".arena").appendChild(rangeDisplay);

//==============================================
// ÉTAT LOCAL (affichage uniquement)
//==============================================
let maClasse = null; // "hero" ou "mage"
let monPerso = null; // état local du personnage du joueur (pour le range display)
const keys = {};
let showRange = false;

//==============================================
// CONNEXION & CHOIX DE CLASSE
//==============================================
// Récupère la classe depuis localStorage (définie sur l'écran de sélection)
const classeChoisie = localStorage.getItem("classeChoisie") || "hero";

socket.on("connect", () => {
    socket.emit("rejoindre", { classe: classeChoisie });
});

socket.on("rejoindre_ok", ({ classe }) => {
    maClasse = classe;
    console.log(`Connecté en tant que : ${classe}`);
});

socket.on("erreur", ({ message }) => {
    alert("Erreur : " + message);
});

//==============================================
// MISE À JOUR DE L'AFFICHAGE DEPUIS LE SERVEUR
//==============================================
socket.on("game_state", ({ hero, mage }) => {
    // Positions
    heroDiv.style.left = hero.x + "px";
    heroDiv.style.top = hero.y + "px";
    mageDiv.style.left = mage.x + "px";
    mageDiv.style.top = mage.y + "px";

    // Points de vie
    heroPV.textContent = "PV: " + hero.pv;
    magePV.textContent = "PV: " + mage.pv;

    // Mise à jour de l'état local du joueur pour le range display
    if (maClasse === "hero") {
        monPerso = hero;
    } else if (maClasse === "mage") {
        monPerso = mage;
    }

    // Affichage de la portée
    if (showRange && monPerso) {
        rangeDisplay.style.display = "block";
        const diameter = monPerso.range * 2;
        rangeDisplay.style.width = diameter + "px";
        rangeDisplay.style.height = diameter + "px";
        rangeDisplay.style.left = (monPerso.x + 40 - monPerso.range) + "px";
        rangeDisplay.style.top = (monPerso.y + 40 - monPerso.range) + "px";
    } else {
        rangeDisplay.style.display = "none";
    }
});

socket.on("game_over", ({ winner }) => {
    localStorage.setItem("winner", winner);
    window.location.href = "victoires.html";
});

socket.on("hors_de_portee", ({ distance, range }) => {
    console.log(`Hors de portée ! Distance: ${distance}px, Portée: ${range}px`);
});

//==============================================
// GESTION DES TOUCHES — envoi au serveur
//==============================================
document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!keys[key]) {
        keys[key] = true;
        socket.emit("keys_update", { keys });
    }

    if (e.key === "Shift") {
        showRange = true;
    }
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
// GESTION DES CLICS — attaque sur l'ennemi
//==============================================
const ennemiDiv = classeChoisie === "hero" ? mageDiv : heroDiv;

document.addEventListener("mousedown", (e) => {
    const clickedOnEnemy = ennemiDiv.contains(e.target) || e.target === ennemiDiv;
    if (!clickedOnEnemy) return;

    if (e.button === 0) {
        socket.emit("attaque");
    }

    if (e.button === 2) {
        socket.emit("attaque_speciale");
    }
});

document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

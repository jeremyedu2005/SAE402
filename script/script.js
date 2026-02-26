//==============================================
// CLASSE PERSONNAGE
//==============================================
class Personnage {
    constructor(nom, pv, attaqueN, attaqueSPE, resistance, range) {
        this.nom = nom;
        this.pv = pv;
        this.attaqueN = attaqueN;
        this.attaqueSPE = attaqueSPE;
        this.resistance = resistance;
        this.range = range; 
    }

    attaquer(cible) {
        const degats = Math.max(this.attaqueN - cible.resistance, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;
    }

    attaqueSpeciale(cible) {
        const degats = Math.max(this.attaqueSPE - cible.resistance / 2, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;
    }
}

//==============================================
// RÉCUPÉRATION DES ÉLÉMENTS HTML
//==============================================
const heroDiv = document.getElementById("hero");
const mageDiv = document.getElementById("mage");
const heroPV = document.getElementById("heroPV");
const magePV = document.getElementById("magePV");

//==============================================
// INITIALISATION DES PERSONNAGES
//==============================================
const classeChoisie = localStorage.getItem("classeChoisie");

let joueurDiv, joueurPV;
let ennemiDiv, ennemiPV;
let joueur, ennemi;

if (classeChoisie === "mage") {
    joueur = new Personnage("Mage", 200, 40, 80, 10, 250);  
    ennemi = new Personnage("Hero", 300, 40, 60, 20, 100); 

    joueurDiv = mageDiv;
    joueurPV = magePV;

    ennemiDiv = heroDiv;
    ennemiPV = heroPV;
} else {
    joueur = new Personnage("Hero", 300, 40, 60, 20, 100); 
    ennemi = new Personnage("Mage", 200, 40, 80, 10, 250); 

    joueurDiv = heroDiv;
    joueurPV = heroPV;

    ennemiDiv = mageDiv;
    ennemiPV = magePV;
}

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
// POSITIONS INITIALES
//==============================================
let position = { x: 100, y: 200 };
joueurDiv.style.left = position.x + "px";
joueurDiv.style.top = position.y + "px";
const speed = 4; 

ennemiDiv.style.left = (window.innerWidth - ennemiDiv.offsetWidth - 100) + "px";
ennemiDiv.style.top = "200px";

//==============================================
// GESTION DES TOUCHES
//==============================================
const keys = {};
let showRange = false;

document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.key === "Shift") {
        showRange = true;
    }
});

document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
    
    if (e.key === "Shift") {
        showRange = false;
    }
});

//==============================================
// FONCTIONS UTILITAIRES
//==============================================
function calculerDistance(elem1, elem2) {
    const rect1 = elem1.getBoundingClientRect();
    const rect2 = elem2.getBoundingClientRect();
    
    const center1 = {
        x: rect1.left + rect1.width / 2,
        y: rect1.top + rect1.height / 2
    };
    
    const center2 = {
        x: rect2.left + rect2.width / 2,
        y: rect2.top + rect2.height / 2
    };
    
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    
    return Math.sqrt(dx * dx + dy * dy);
}

function updateAffichage() {
    joueurPV.textContent = "PV: " + joueur.pv;
    ennemiPV.textContent = "PV: " + ennemi.pv;
    
    checkVictory();
}

function checkVictory() {
    if (ennemi.pv <= 0) {
        localStorage.setItem("winner", joueur.nom);
        window.location.href = "victoires.html";
    }
    
    if (joueur.pv <= 0) {
        localStorage.setItem("winner", ennemi.nom);
        window.location.href = "victoires.html";
    }
}

function attaquer() {
    joueur.attaquer(ennemi);
    updateAffichage();
}

//==============================================
// SYSTÈME D'ATTAQUE À LA SOURIS
//==============================================
document.addEventListener("mousedown", (e) => {
    const clickedOnEnemy = ennemiDiv.contains(e.target) || e.target === ennemiDiv;
    
    if (!clickedOnEnemy) return;
    
    const distance = calculerDistance(joueurDiv, ennemiDiv);
    
    if (distance > joueur.range) {
        console.log("Hors de portée ! Distance: " + Math.round(distance) + "px, Portée: " + joueur.range + "px");
        return;
    }
    
    if (e.button === 0) {
        joueur.attaquer(ennemi);
        updateAffichage();
    }

    if (e.button === 2) {
        joueur.attaqueSpeciale(ennemi);
        updateAffichage();
    }
});

document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

//==============================================
// BOUCLE DE JEU PRINCIPALE
//==============================================
function gameLoop() {
    let moveX = 0;
    let moveY = 0;

    if (keys["z"]) moveY -= 1;
    if (keys["s"]) moveY += 1;
    if (keys["q"]) moveX -= 1;
    if (keys["d"]) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
        const length = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= length;
        moveY /= length;
    }

    position.x += moveX * speed;
    position.y += moveY * speed;

    const maxX = window.innerWidth - joueurDiv.offsetWidth;
    const maxY = window.innerHeight - joueurDiv.offsetHeight;

    if (position.x < 0) position.x = 0;
    if (position.y < 0) position.y = 0;
    if (position.x > maxX) position.x = maxX;
    if (position.y > maxY) position.y = maxY;

    joueurDiv.style.left = position.x + "px";
    joueurDiv.style.top = position.y + "px";

    if (showRange) {
        rangeDisplay.style.display = "block";
        const diameter = joueur.range * 2;
        rangeDisplay.style.width = diameter + "px";
        rangeDisplay.style.height = diameter + "px";
        rangeDisplay.style.left = (position.x + joueurDiv.offsetWidth / 2 - joueur.range) + "px";
        rangeDisplay.style.top = (position.y + joueurDiv.offsetHeight / 2 - joueur.range) + "px";
    } else {
        rangeDisplay.style.display = "none";
    }

    requestAnimationFrame(gameLoop);
}

//==============================================
// DÉMARRAGE DU JEU
//==============================================
updateAffichage();
gameLoop();
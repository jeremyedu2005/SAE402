const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//==============================================
// CLASSE PERSONNAGE (logique serveur)
//==============================================
class Personnage {
    constructor(nom, pv, attaqueN, attaqueSPE, resistance, range) {
        this.nom = nom;
        this.pv = pv;
        this.pvMax = pv;
        this.attaqueN = attaqueN;
        this.attaqueSPE = attaqueSPE;
        this.resistance = resistance;
        this.range = range;
    }

    attaquer(cible) {
        const degats = Math.max(this.attaqueN - cible.resistance, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;
        return degats;
    }

    attaqueSpeciale(cible) {
        const degats = Math.max(this.attaqueSPE - cible.resistance / 2, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;
        return degats;
    }
}

//==============================================
// ÉTAT DU JEU
//==============================================
const SPEED = 4;
const ARENA_WIDTH = 1280;
const ARENA_HEIGHT = 720;
const CHAR_SIZE = 80;

let gameState = null;

function creerEtatInitial() {
    return {
        hero: {
            nom: "Hero",
            pv: 300,
            pvMax: 300,
            attaqueN: 40,
            attaqueSPE: 60,
            resistance: 20,
            range: 100,
            x: 100,
            y: 200,
        },
        mage: {
            nom: "Mage",
            pv: 200,
            pvMax: 200,
            attaqueN: 40,
            attaqueSPE: 80,
            resistance: 10,
            range: 250,
            x: ARENA_WIDTH - CHAR_SIZE - 100,
            y: 200,
        },
        // socketId -> classe jouée
        joueurs: {},
        winner: null,
    };
}

function calculerDistance(p1, p2) {
    const cx1 = p1.x + CHAR_SIZE / 2;
    const cy1 = p1.y + CHAR_SIZE / 2;
    const cx2 = p2.x + CHAR_SIZE / 2;
    const cy2 = p2.y + CHAR_SIZE / 2;
    const dx = cx2 - cx1;
    const dy = cy2 - cy1;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkVictory() {
    if (gameState.hero.pv <= 0) {
        gameState.winner = "Mage";
        io.emit("game_over", { winner: "Mage" });
    } else if (gameState.mage.pv <= 0) {
        gameState.winner = "Hero";
        io.emit("game_over", { winner: "Hero" });
    }
}

function broadcastGameState() {
    io.emit("game_state", {
        hero: {
            nom: gameState.hero.nom,
            pv: gameState.hero.pv,
            pvMax: gameState.hero.pvMax,
            x: gameState.hero.x,
            y: gameState.hero.y,
            range: gameState.hero.range,
        },
        mage: {
            nom: gameState.mage.nom,
            pv: gameState.mage.pv,
            pvMax: gameState.mage.pvMax,
            x: gameState.mage.x,
            y: gameState.mage.y,
            range: gameState.mage.range,
        },
        winner: gameState.winner,
    });
}

//==============================================
// BOUCLE DE JEU SERVEUR
//==============================================
const keysPressed = {}; // socketId -> { keys }

function serverGameLoop() {
    if (!gameState || gameState.winner) return;

    for (const [socketId, keys] of Object.entries(keysPressed)) {
        const classe = gameState.joueurs[socketId];
        if (!classe) continue;

        const perso = gameState[classe];
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

        perso.x += moveX * SPEED;
        perso.y += moveY * SPEED;

        const maxX = ARENA_WIDTH - CHAR_SIZE;
        const maxY = ARENA_HEIGHT - CHAR_SIZE;

        if (perso.x < 0) perso.x = 0;
        if (perso.y < 0) perso.y = 0;
        if (perso.x > maxX) perso.x = maxX;
        if (perso.y > maxY) perso.y = maxY;
    }

    broadcastGameState();
}

setInterval(serverGameLoop, 1000 / 60); // 60 FPS

//==============================================
// CONNEXIONS SOCKET
//==============================================
io.on("connection", (socket) => {
    console.log("Nouveau client connecté :", socket.id);

    // Rejoindre la partie en choisissant sa classe
    socket.on("rejoindre", ({ classe }) => {
        if (!gameState) {
            gameState = creerEtatInitial();
        }

        // Vérifie si la classe est déjà prise
        const classesPrises = Object.values(gameState.joueurs);
        if (classesPrises.includes(classe)) {
            socket.emit("erreur", { message: `La classe ${classe} est déjà prise.` });
            return;
        }

        gameState.joueurs[socket.id] = classe;
        keysPressed[socket.id] = {};

        console.log(`Joueur ${socket.id} joue le ${classe}`);
        socket.emit("rejoindre_ok", {
            classe,
            hero: gameState.hero,
            mage: gameState.mage,
        });

        broadcastGameState();
    });

    // Mise à jour des touches appuyées
    socket.on("keys_update", ({ keys }) => {
        if (keysPressed[socket.id] !== undefined) {
            keysPressed[socket.id] = keys;
        }
    });

    // Attaque normale
    socket.on("attaque", () => {
        if (!gameState || gameState.winner) return;

        const classe = gameState.joueurs[socket.id];
        if (!classe) return;

        const attaquant = gameState[classe];
        const cibleNom = classe === "hero" ? "mage" : "hero";
        const cible = gameState[cibleNom];

        const distance = calculerDistance(attaquant, cible);
        if (distance > attaquant.range) {
            socket.emit("hors_de_portee", { distance: Math.round(distance), range: attaquant.range });
            return;
        }

        const degats = Math.max(attaquant.attaqueN - cible.resistance, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;

        console.log(`${attaquant.nom} attaque ${cible.nom} pour ${degats} dégâts (PV restants: ${cible.pv})`);
        checkVictory();
        broadcastGameState();
    });

    // Attaque spéciale
    socket.on("attaque_speciale", () => {
        if (!gameState || gameState.winner) return;

        const classe = gameState.joueurs[socket.id];
        if (!classe) return;

        const attaquant = gameState[classe];
        const cibleNom = classe === "hero" ? "mage" : "hero";
        const cible = gameState[cibleNom];

        const distance = calculerDistance(attaquant, cible);
        if (distance > attaquant.range) {
            socket.emit("hors_de_portee", { distance: Math.round(distance), range: attaquant.range });
            return;
        }

        const degats = Math.max(attaquant.attaqueSPE - cible.resistance / 2, 0);
        cible.pv -= degats;
        if (cible.pv < 0) cible.pv = 0;

        console.log(`${attaquant.nom} attaque spéciale sur ${cible.nom} pour ${degats} dégâts (PV restants: ${cible.pv})`);
        checkVictory();
        broadcastGameState();
    });

    socket.on("disconnect", () => {
        console.log("Client déconnecté :", socket.id);
        delete gameState?.joueurs[socket.id];
        delete keysPressed[socket.id];
    });
});

app.use(express.static("public"));

server.listen(3004, () => console.log("Serveur démarré sur http://localhost:3004"));

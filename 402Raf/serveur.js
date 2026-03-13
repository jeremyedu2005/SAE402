const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//==============================================
// CONSTANTES
//==============================================
const SPEED = 4;
const ARENA_WIDTH = 1280;
const ARENA_HEIGHT = 720;
const CHAR_SIZE = 80;

const CLASSES = {
    hero:     { pv: 300, attaqueN: 40, attaqueSPE: 60, resistance: 20, range: 100,  couleur: "#e74c3c" },
    mage:     { pv: 200, attaqueN: 40, attaqueSPE: 80, resistance: 10, range: 250,  couleur: "#9b59b6" },
    archer:   { pv: 220, attaqueN: 35, attaqueSPE: 70, resistance: 12, range: 350,  couleur: "#27ae60" },
    guerrier: { pv: 350, attaqueN: 50, attaqueSPE: 55, resistance: 30, range: 90,   couleur: "#e67e22" },
};

//==============================================
// ÉTAT DU JEU
//==============================================
const joueurs = {};      // socketId -> personnage
const keysPressed = {};  // socketId -> { keys }
const equipesEnAttente = { blue: [], red: [] }; // Liste des sockets en attente par équipe

function creerPersonnage(socketId, nomJoueur, classe, equipe) {
    const stats = CLASSES[classe] || CLASSES.hero;
    const x = Math.floor(Math.random() * (ARENA_WIDTH - CHAR_SIZE - 200)) + 100;
    const y = Math.floor(Math.random() * (ARENA_HEIGHT - CHAR_SIZE - 200)) + 100;

    // Couleur basée sur l'équipe
    let couleur = stats.couleur;
    if (equipe === "blue") {
        couleur = "#0080ff"; // Bleu
    } else if (equipe === "red") {
        couleur = "#ff4040"; // Rouge
    }

    return {
        id: socketId,
        nomJoueur,
        classe,
        equipe,
        pv: stats.pv,
        pvMax: stats.pv,
        attaqueN: stats.attaqueN,
        attaqueSPE: stats.attaqueSPE,
        resistance: stats.resistance,
        range: stats.range,
        couleur,
        x,
        y,
    };
}

function calculerDistance(p1, p2) {
    const cx1 = p1.x + CHAR_SIZE / 2;
    const cy1 = p1.y + CHAR_SIZE / 2;
    const cx2 = p2.x + CHAR_SIZE / 2;
    const cy2 = p2.y + CHAR_SIZE / 2;
    return Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2);
}

function broadcastGameState() {
    io.emit("game_state", { joueurs: Object.values(joueurs) });
}

//==============================================
// BOUCLE DE JEU (60 FPS)
//==============================================
function serverGameLoop() {
    let dirty = false;

    for (const [socketId, keys] of Object.entries(keysPressed)) {
        const perso = joueurs[socketId];
        if (!perso || perso.pv <= 0) continue;

        let moveX = 0;
        let moveY = 0;

        if (keys["z"]) moveY -= 1;
        if (keys["s"]) moveY += 1;
        if (keys["q"]) moveX -= 1;
        if (keys["d"]) moveX += 1;

        if (moveX === 0 && moveY === 0) continue;

        dirty = true;
        const length = Math.sqrt(moveX * moveX + moveY * moveY);
        perso.x = Math.max(0, Math.min(ARENA_WIDTH - CHAR_SIZE, perso.x + (moveX / length) * SPEED));
        perso.y = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, perso.y + (moveY / length) * SPEED));
    }

    if (dirty) broadcastGameState();
}

setInterval(serverGameLoop, 1000 / 60);

//==============================================
// CONNEXIONS SOCKET
//==============================================
io.on("connection", (socket) => {
    console.log(`[Connexion] Nouveau client : ${socket.id}`);

    socket.on("rejoindre_equipe", ({ equipe }) => {
        if (equipe !== "blue" && equipe !== "red") return;
        equipesEnAttente[equipe].push({ id: socket.id, nom: null });
        // Envoyer la liste des membres
        const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
        socket.emit("membres_equipe", membres);
        // Notifier les autres membres
        equipesEnAttente[equipe].forEach(m => {
            if (m.id !== socket.id) {
                io.to(m.id).emit("membres_equipe", membres);
            }
        });
    });

    socket.on("rejoindre", ({ nomJoueur, classe, equipe }) => {
        if (!CLASSES[classe]) {
            socket.emit("erreur", { message: `Classe inconnue : ${classe}` });
            return;
        }

        const perso = creerPersonnage(socket.id, nomJoueur, classe, equipe);
        joueurs[socket.id] = perso;
        keysPressed[socket.id] = {};

        // Retirer de l'équipe en attente et mettre à jour les noms
        equipesEnAttente[equipe] = equipesEnAttente[equipe].filter(m => {
            if (m.id === socket.id) {
                m.nom = nomJoueur;
                return false; // Retirer
            }
            return true;
        });
        // Notifier les membres restants
        const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
        equipesEnAttente[equipe].forEach(m => {
            io.to(m.id).emit("membres_equipe", membres);
        });

        console.log(`[Joueur connecté] ${nomJoueur} (${classe}, ${equipe}) — ID: ${socket.id}`);

        socket.emit("rejoindre_ok", { monId: socket.id, perso });
        broadcastGameState();
    });

    socket.on("keys_update", ({ keys }) => {
        if (keysPressed[socket.id] !== undefined) {
            keysPressed[socket.id] = keys;
        }
    });

    socket.on("attaque", ({ cibleId }) => {
        const attaquant = joueurs[socket.id];
        const cible = joueurs[cibleId];
        if (!attaquant || !cible || attaquant.pv <= 0 || cible.pv <= 0) return;

        const distance = calculerDistance(attaquant, cible);
        if (distance > attaquant.range) {
            socket.emit("hors_de_portee", { distance: Math.round(distance), range: attaquant.range });
            return;
        }

        const degats = Math.max(attaquant.attaqueN - cible.resistance, 0);
        cible.pv = Math.max(0, cible.pv - degats);

        console.log(`[Attaque] ${attaquant.nomJoueur} (${attaquant.classe}) → ${cible.nomJoueur} : ${degats} dégâts (PV: ${cible.pv}/${cible.pvMax})`);

        if (cible.pv <= 0) {
            console.log(`[Mort] ${cible.nomJoueur} éliminé par ${attaquant.nomJoueur} !`);
            io.emit("joueur_elimine", {
                victimeId: cibleId,
                tueurNom: attaquant.nomJoueur,
                victimeNom: cible.nomJoueur,
            });
        }

        broadcastGameState();
    });

    socket.on("attaque_speciale", ({ cibleId }) => {
        const attaquant = joueurs[socket.id];
        const cible = joueurs[cibleId];
        if (!attaquant || !cible || attaquant.pv <= 0 || cible.pv <= 0) return;

        const distance = calculerDistance(attaquant, cible);
        if (distance > attaquant.range) {
            socket.emit("hors_de_portee", { distance: Math.round(distance), range: attaquant.range });
            return;
        }

        const degats = Math.max(attaquant.attaqueSPE - cible.resistance / 2, 0);
        cible.pv = Math.max(0, cible.pv - degats);

        console.log(`[Attaque Spé] ${attaquant.nomJoueur} (${attaquant.classe}) → ${cible.nomJoueur} : ${degats} dégâts (PV: ${cible.pv}/${cible.pvMax})`);

        if (cible.pv <= 0) {
            console.log(`[Mort] ${cible.nomJoueur} éliminé par ${attaquant.nomJoueur} !`);
            io.emit("joueur_elimine", {
                victimeId: cibleId,
                tueurNom: attaquant.nomJoueur,
                victimeNom: cible.nomJoueur,
            });
        }

        broadcastGameState();
    });

    socket.on("disconnect", () => {
        const perso = joueurs[socket.id];
        const nom = perso ? `${perso.nomJoueur} (${perso.classe})` : socket.id;
        console.log(`[Déconnexion] ${nom} a quitté la partie.`);

        delete joueurs[socket.id];
        delete keysPressed[socket.id];

        // Retirer des équipes en attente
        for (const equipe in equipesEnAttente) {
            equipesEnAttente[equipe] = equipesEnAttente[equipe].filter(m => m.id !== socket.id);
            // Notifier les restants
            const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
            equipesEnAttente[equipe].forEach(m => {
                io.to(m.id).emit("membres_equipe", membres);
            });
        }

        io.emit("joueur_parti", { id: socket.id });
        broadcastGameState();
    });
});

app.use(express.static("public"));

server.listen(3004, () => console.log("Serveur démarré sur http://localhost:3004"));

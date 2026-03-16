const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//==============================================
// CONSTANTES
//==============================================
const SPEED_BASE  = 5;
const ARENA_WIDTH  = 6900;
const ARENA_HEIGHT = 4000;
const CHAR_SIZE    = 50;

const CLASSES = {
    hero:     { pv: 300, resistance: 20, couleur: "#e74c3c" },
    mage:     { pv: 200, resistance: 10, couleur: "#9b59b6" },
    archer:   { pv: 220, resistance: 12, couleur: "#27ae60" },
    guerrier: { pv: 350, resistance: 30, couleur: "#e67e22" },
};

//==============================================
// DÉFINITION DES ATTAQUES PAR CLASSE
//
// attaque1 → clic gauche
// attaque2 → clic droit  (bouclier héro : type "bouclier", maintenu)
// attaque3 → espace      (déplacement)
//
// TYPES :
//   "projectile"  — balle qui voyage
//   "zone"        — dégâts instantanés (arc / laser / cercle / meteorite)
//   "bouclier"    — immunité + ralentissement tant que maintenu (héro)
//   "dash"        — téléportation instantanée dans la direction des touches
//   "boost"       — vitesse multipliée temporairement (guerrier)
//==============================================
const ATTAQUES = {
    hero: {
        attaque1: {
            type: "zone", forme: "arc",
            degats: 60, resistance_mult: 1,
            rayon: 120, angleOuverture: 70,
            dureeAffichage: 200, cooldown: 600,
            couleur: "#f39c12", label: "Coup d'épée",
        },
        attaque2: {
            type: "bouclier",
            dureeMax: 3000,      // durée max du bouclier en ms
            cooldown: 5000,      // cooldown après la fin du bouclier
            speedMult: 0.3,      // vitesse réduite à 30% pendant le bouclier
            couleur: "#00aaff", label: "Bouclier",
        },
        attaque3: {
            type: "dash",
            distance: 300, cooldown: 2000,
            couleur: "#ffffff", label: "Dash",
        },
    },
    mage: {
        attaque1: {
            type: "projectile",
            degats: 55, vitesse: 8, taille: 18,
            dureeMax: 3000, disparitAuContact: true,
            cooldown: 500, couleur: "#c39bd3", label: "Boule de feu",
        },
        attaque2: {
            type: "zone", forme: "laser",
            degats: 80, resistance_mult: 0.5,
            longueur: 1500, largeur: 50,
            dureeAffichage: 400, cooldown: 2000,
            couleur: "#00eeff", label: "Laser magique",
        },
        attaque3: {
            type: "dash",
            distance: 500, cooldown: 6000,
            estTeleportation: true,   // pas d'animation intermédiaire
            couleur: "#cc88ff", label: "Téléportation",
        },
    },
    archer: {
        attaque1: {
            type: "projectile",
            degats: 40, vitesse: 18, taille: 7,
            dureeMax: 1500, disparitAuContact: true,
            cooldown: 400, couleur: "#2ecc71", label: "Flèche",
        },
        attaque2: {
            type: "zone", forme: "meteorite",
            degats: 50, resistance_mult: 1,
            rayon: 120,
            dureeAffichage: 600, cooldown: 3000,
            couleur: "#f1c40f", label: "Pluie de flèches",
        },
        attaque3: {
            type: "dash",
            distance: 350, cooldown: 3500,
            couleur: "#aaffaa", label: "Dash",
        },
    },
    guerrier: {
        attaque1: {
            type: "zone", forme: "arc",
            degats: 80, resistance_mult: 1,
            rayon: 90, angleOuverture: 90,
            dureeAffichage: 250, cooldown: 800,
            couleur: "#e67e22", label: "Coup d'épée",
        },
        attaque2: {
            type: "zone", forme: "cercle",
            degats: 40, resistance_mult: 1,
            rayon: 150, dureeAffichage: 500, cooldown: 3000,
            couleur: "#e74c3c", label: "Frappe au sol",
        },
        attaque3: {
            type: "boost",
            duree: 2000,         // durée du boost en ms
            speedMult: 2.5,      // multiplicateur de vitesse
            cooldown: 5000,
            couleur: "#ff8800", label: "Sprint",
        },
    },
};

//==============================================
// CLASSE PROJECTILE
//==============================================
let projectileIdCounter = 0;

class Projectile {
    constructor({ lanceurId, equipe, classe, x, y, dirX, dirY, stats }) {
        this.id        = ++projectileIdCounter;
        this.lanceurId = lanceurId;
        this.equipe    = equipe;
        this.classe    = classe;
        this.x = x; this.y = y;
        this.dirX = dirX; this.dirY = dirY;
        this.degats            = stats.degats;
        this.vitesse           = stats.vitesse;
        this.taille            = stats.taille;
        this.dureeMax          = stats.dureeMax;
        this.disparitAuContact = stats.disparitAuContact;
        this.couleur           = stats.couleur;
        this.createdAt = Date.now();
        this.actif     = true;
    }
    avancer() { this.x += this.dirX * this.vitesse; this.y += this.dirY * this.vitesse; }
    estExpire() {
        if (Date.now() - this.createdAt > this.dureeMax) return true;
        if (this.x < 0 || this.x > ARENA_WIDTH)  return true;
        if (this.y < 0 || this.y > ARENA_HEIGHT) return true;
        return false;
    }
    toucheJoueur(joueur) {
        const cx = joueur.x + CHAR_SIZE / 2;
        const cy = joueur.y + CHAR_SIZE / 2;
        return Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2) < this.taille + CHAR_SIZE / 2;
    }
    toJSON() {
        return { id: this.id, x: this.x, y: this.y, taille: this.taille, couleur: this.couleur, classe: this.classe };
    }
}

//==============================================
// CLASSE ATTAQUE ZONE
//==============================================
let zoneIdCounter = 0;

class AttaqueZone {
    constructor({ lanceurId, equipe, classe, stats, tireurX, tireurY, dirX, dirY, cibleX, cibleY }) {
        this.id        = ++zoneIdCounter;
        this.lanceurId = lanceurId;
        this.equipe    = equipe;
        this.classe    = classe;
        this.forme     = stats.forme;
        this.degats    = stats.degats;
        this.resistance_mult = stats.resistance_mult ?? 1;
        this.couleur   = stats.couleur;
        this.dureeAffichage = stats.dureeAffichage;
        this.createdAt = Date.now();
        this.tireurX = tireurX; this.tireurY = tireurY;
        this.dirX = dirX; this.dirY = dirY;
        this.cibleX = cibleX; this.cibleY = cibleY;
        this.rayon          = stats.rayon          ?? 0;
        this.angleOuverture = stats.angleOuverture ?? 90;
        this.longueur       = stats.longueur       ?? 300;
        this.largeur        = stats.largeur        ?? 20;
        this.victimesImpactees = new Set();
    }
    estExpire() { return Date.now() - this.createdAt > this.dureeAffichage; }
    toucheJoueur(joueur) {
        if (this.victimesImpactees.has(joueur.id)) return false;
        const cx = joueur.x + CHAR_SIZE / 2;
        const cy = joueur.y + CHAR_SIZE / 2;
        if (this.forme === "arc") {
            const dx = cx - this.tireurX, dy = cy - this.tireurY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.rayon) return false;
            const angle    = Math.atan2(dy, dx);
            const dirAngle = Math.atan2(this.dirY, this.dirX);
            let diff = Math.abs(angle - dirAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            return diff <= (this.angleOuverture * Math.PI / 180);
        }
        if (this.forme === "laser") {
            const dx = cx - this.tireurX, dy = cy - this.tireurY;
            const proj = dx * this.dirX + dy * this.dirY;
            if (proj < 0 || proj > this.longueur) return false;
            const perpX = dx - proj * this.dirX, perpY = dy - proj * this.dirY;
            return Math.sqrt(perpX * perpX + perpY * perpY) < this.largeur / 2 + CHAR_SIZE / 2;
        }
        if (this.forme === "cercle") {
            return Math.sqrt((cx - this.tireurX) ** 2 + (cy - this.tireurY) ** 2) < this.rayon + CHAR_SIZE / 2;
        }
        if (this.forme === "meteorite") {
            return Math.sqrt((cx - this.cibleX) ** 2 + (cy - this.cibleY) ** 2) < this.rayon + CHAR_SIZE / 2;
        }
        return false;
    }
    toJSON() {
        return {
            id: this.id, forme: this.forme, couleur: this.couleur,
            tireurX: this.tireurX, tireurY: this.tireurY,
            dirX: this.dirX, dirY: this.dirY,
            cibleX: this.cibleX, cibleY: this.cibleY,
            rayon: this.rayon, angleOuverture: this.angleOuverture,
            longueur: this.longueur, largeur: this.largeur,
            dureeAffichage: this.dureeAffichage,
        };
    }
}

//==============================================
// ÉTAT DU JEU
//==============================================
const joueurs          = {};
const keysPressed      = {};
const projectiles      = {};
const zonesActives     = {};
const equipesEnAttente = { blue: [], red: [] };
const cooldowns        = {};

// États spéciaux actifs : bouclier, boost
// effets[socketId] = { bouclier: { actif, finAt }, boost: { actif, finAt, speedMult } }
const effets = {};

function creerPersonnage(socketId, nomJoueur, classe, equipe) {
    const stats = CLASSES[classe] || CLASSES.hero;
    const x = Math.floor(Math.random() * (ARENA_WIDTH  - CHAR_SIZE - 200)) + 100;
    const y = Math.floor(Math.random() * (ARENA_HEIGHT - CHAR_SIZE - 200)) + 100;
    let couleur = stats.couleur;
    if (equipe === "blue") couleur = "#0080ff";
    if (equipe === "red")  couleur = "#ff4040";
    return { id: socketId, nomJoueur, classe, equipe, pv: stats.pv, pvMax: stats.pv, resistance: stats.resistance, couleur, x, y };
}

function verifierCooldown(socketId, nomAttaque, cooldownMs) {
    if (!cooldowns[socketId]) cooldowns[socketId] = {};
    const dernierLancement = cooldowns[socketId][nomAttaque] ?? 0;
    const maintenant = Date.now();
    if (maintenant - dernierLancement < cooldownMs) return false;
    cooldowns[socketId][nomAttaque] = maintenant;
    return true;
}

function appliquerDegatsZone(zone) {
    for (const joueur of Object.values(joueurs)) {
        if (joueur.id === zone.lanceurId) continue;
        if (joueur.equipe === zone.equipe) continue;
        if (joueur.pv <= 0) continue;
        // Ignore les joueurs avec bouclier actif
        if (effets[joueur.id]?.bouclier?.actif) continue;
        if (zone.toucheJoueur(joueur)) {
            zone.victimesImpactees.add(joueur.id);
            const degats = Math.max(zone.degats - joueur.resistance * zone.resistance_mult, 0);
            joueur.pv = Math.max(0, joueur.pv - degats);
            const lanceur = joueurs[zone.lanceurId];
            const lanceurNom = lanceur ? lanceur.nomJoueur : "Inconnu";
            console.log(`[Zone ${zone.forme}] ${lanceurNom} → ${joueur.nomJoueur} : ${degats} dégâts (PV: ${joueur.pv}/${joueur.pvMax})`);
            if (joueur.pv <= 0) {
                console.log(`[Mort] ${joueur.nomJoueur} éliminé par ${lanceurNom} !`);
                io.emit("joueur_elimine", { victimeId: joueur.id, tueurNom: lanceurNom, victimeNom: joueur.nomJoueur });
            }
        }
    }
}

function broadcastGameState() {
    io.emit("game_state", {
        joueurs:     Object.values(joueurs).map(j => ({
            ...j,
            // Envoie les états spéciaux pour le rendu client
            bouclierActif: effets[j.id]?.bouclier?.actif ?? false,
            boostActif:    effets[j.id]?.boost?.actif    ?? false,
        })),
        projectiles: Object.values(projectiles).map(p => p.toJSON()),
        zones:       Object.values(zonesActives).map(z => z.toJSON()),
    });
}

//==============================================
// BOUCLE DE JEU (60 FPS)
//==============================================
function serverGameLoop() {
    let dirty = false;
    const now = Date.now();

    // --- Expiration des effets ---
    for (const [sid, effet] of Object.entries(effets)) {
        // Bouclier : expire si dureeMax dépassée même si maintenu
        if (effet.bouclier?.actif && now >= effet.bouclier.finAt) {
            effet.bouclier.actif = false;
            // Lance le cooldown depuis la FIN du bouclier
            cooldowns[sid] = cooldowns[sid] || {};
            cooldowns[sid]["attaque2"] = now;
            const joueur = joueurs[sid];
            if (joueur) console.log(`[Bouclier] ${joueur.nomJoueur} — bouclier expiré, cooldown lancé`);
            const statsB = ATTAQUES[joueurs[sid]?.classe]?.attaque2;
            if (statsB) io.to(sid).emit("attaque_ok", { attaque: "attaque2", cooldown: statsB.cooldown });
            dirty = true;
        }
        // Boost : expire automatiquement
        if (effet.boost?.actif && now >= effet.boost.finAt) {
            effet.boost.actif = false;
            dirty = true;
        }
    }

    // --- Déplacement joueurs ---
    for (const [socketId, keys] of Object.entries(keysPressed)) {
        const perso = joueurs[socketId];
        if (!perso || perso.pv <= 0) continue;

        let moveX = 0, moveY = 0;
        if (keys["z"]) moveY -= 1;
        if (keys["s"]) moveY += 1;
        if (keys["q"]) moveX -= 1;
        if (keys["d"]) moveX += 1;
        if (moveX === 0 && moveY === 0) continue;

        dirty = true;
        const length = Math.sqrt(moveX * moveX + moveY * moveY);

        // Calcule la vitesse effective (bouclier = ralenti, boost = accéléré)
        let speedMult = 1;
        if (effets[socketId]?.bouclier?.actif) speedMult = ATTAQUES[perso.classe]?.attaque2?.speedMult ?? 0.3;
        if (effets[socketId]?.boost?.actif)    speedMult = effets[socketId].boost.speedMult;

        perso.x = Math.max(0, Math.min(ARENA_WIDTH  - CHAR_SIZE, perso.x + (moveX / length) * SPEED_BASE * speedMult));
        perso.y = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, perso.y + (moveY / length) * SPEED_BASE * speedMult));
    }

    // --- Projectiles ---
    for (const [pid, proj] of Object.entries(projectiles)) {
        if (!proj.actif) { delete projectiles[pid]; dirty = true; continue; }
        proj.avancer();
        if (proj.estExpire()) { delete projectiles[pid]; dirty = true; continue; }
        for (const joueur of Object.values(joueurs)) {
            if (joueur.id === proj.lanceurId) continue;
            if (joueur.equipe === proj.equipe) continue;
            if (joueur.pv <= 0) continue;

            // Bouclier actif : détruit les projectiles destructibles qui touchent le joueur
            if (effets[joueur.id]?.bouclier?.actif) {
                if (proj.disparitAuContact && proj.toucheJoueur(joueur)) {
                    const lanceur = joueurs[proj.lanceurId];
                    console.log(`[Bouclier] ${joueur.nomJoueur} détruit le projectile de ${lanceur?.nomJoueur ?? "Inconnu"}`);
                    delete projectiles[pid];
                    dirty = true;
                }
                continue; // dans tous les cas, le bouclier bloque les dégâts
            }

            if (proj.toucheJoueur(joueur)) {
                const degats = Math.max(proj.degats - joueur.resistance, 0);
                joueur.pv = Math.max(0, joueur.pv - degats);
                const lanceur = joueurs[proj.lanceurId];
                const lanceurNom = lanceur ? lanceur.nomJoueur : "Inconnu";
                console.log(`[Projectile] ${lanceurNom} → ${joueur.nomJoueur} : ${degats} dégâts (PV: ${joueur.pv}/${joueur.pvMax})`);
                if (joueur.pv <= 0) {
                    console.log(`[Mort] ${joueur.nomJoueur} éliminé par ${lanceurNom} !`);
                    io.emit("joueur_elimine", { victimeId: joueur.id, tueurNom: lanceurNom, victimeNom: joueur.nomJoueur });
                }
                if (proj.disparitAuContact) { delete projectiles[pid]; }
                dirty = true;
                break;
            }
        }
        dirty = true;
    }

    // --- Zones : expiration ---
    for (const [zid, zone] of Object.entries(zonesActives)) {
        if (zone.estExpire()) { delete zonesActives[zid]; }
        dirty = true;
    }

    if (dirty) broadcastGameState();
}

setInterval(serverGameLoop, 1000 / 60);

//==============================================
// LANCER UNE ATTAQUE
//==============================================
function lancerAttaque(socket, nomAttaque, dirX, dirY, cibleX, cibleY) {
    const tireur = joueurs[socket.id];
    if (!tireur || tireur.pv <= 0) return;

    // Pendant le bouclier, aucune autre attaque ne peut être lancée
    if (effets[socket.id]?.bouclier?.actif && nomAttaque !== "attaque2") {
        socket.emit("cooldown_actif", { attaque: nomAttaque, restantMs: 0 });
        return;
    }

    const stats = ATTAQUES[tireur.classe]?.[nomAttaque];
    if (!stats) return;

    if (!verifierCooldown(socket.id, nomAttaque, stats.cooldown)) {
        const restant = stats.cooldown - (Date.now() - (cooldowns[socket.id]?.[nomAttaque] ?? 0));
        socket.emit("cooldown_actif", { attaque: nomAttaque, restantMs: restant });
        return;
    }

    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    const ndx = len > 0 ? dirX / len : 1;
    const ndy = len > 0 ? dirY / len : 0;
    const cx = tireur.x + CHAR_SIZE / 2;
    const cy = tireur.y + CHAR_SIZE / 2;

    if (stats.type === "projectile") {
        const proj = new Projectile({ lanceurId: socket.id, equipe: tireur.equipe, classe: tireur.classe, x: cx, y: cy, dirX: ndx, dirY: ndy, stats });
        projectiles[proj.id] = proj;
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}"`);

    } else if (stats.type === "zone") {
        const zone = new AttaqueZone({ lanceurId: socket.id, equipe: tireur.equipe, classe: tireur.classe, stats, tireurX: cx, tireurY: cy, dirX: ndx, dirY: ndy, cibleX, cibleY });
        appliquerDegatsZone(zone);
        zonesActives[zone.id] = zone;
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}"`);

    } else if (stats.type === "dash") {
        const keys = keysPressed[socket.id] || {};
        let dx = 0, dy = 0;
        if (keys["z"]) dy -= 1; if (keys["s"]) dy += 1;
        if (keys["q"]) dx -= 1; if (keys["d"]) dx += 1;
        // Si aucune touche ZQSD : dash dans la direction du curseur (envoyée par le client)
        if (dx === 0 && dy === 0) { dx = ndx; dy = ndy; }
        const dLen = Math.sqrt(dx * dx + dy * dy);
        if (dLen === 0) return; // sécurité : aucune direction déterminable
        tireur.x = Math.max(0, Math.min(ARENA_WIDTH  - CHAR_SIZE, tireur.x + (dx / dLen) * stats.distance));
        tireur.y = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, tireur.y + (dy / dLen) * stats.distance));
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}" vers (${Math.round(tireur.x)}, ${Math.round(tireur.y)})`);
        // Broadcast immédiat : la boucle ne pose dirty que si des touches sont enfoncées,
        // donc sans broadcast ici la nouvelle position n'arriverait pas au client.
        broadcastGameState();

    } else if (stats.type === "boost") {
        if (!effets[socket.id]) effets[socket.id] = {};
        effets[socket.id].boost = { actif: true, finAt: Date.now() + stats.duree, speedMult: stats.speedMult };
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}"`);
    }

    socket.emit("attaque_ok", { attaque: nomAttaque, cooldown: stats.cooldown });
}

//==============================================
// CONNEXIONS SOCKET
//==============================================
io.on("connection", (socket) => {
    console.log(`[Connexion] Nouveau client : ${socket.id}`);

    socket.on("rejoindre_equipe", ({ equipe }) => {
        if (equipe !== "blue" && equipe !== "red") return;
        equipesEnAttente[equipe].push({ id: socket.id, nom: null });
        const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
        socket.emit("membres_equipe", membres);
        equipesEnAttente[equipe].forEach(m => { if (m.id !== socket.id) io.to(m.id).emit("membres_equipe", membres); });
    });

    socket.on("rejoindre", ({ nomJoueur, classe, equipe }) => {
        if (!CLASSES[classe]) { socket.emit("erreur", { message: `Classe inconnue : ${classe}` }); return; }
        const perso = creerPersonnage(socket.id, nomJoueur, classe, equipe);
        joueurs[socket.id]     = perso;
        keysPressed[socket.id] = {};
        cooldowns[socket.id]   = {};
        effets[socket.id]      = { bouclier: { actif: false }, boost: { actif: false } };

        equipesEnAttente[equipe] = equipesEnAttente[equipe].filter(m => m.id !== socket.id);
        const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
        equipesEnAttente[equipe].forEach(m => io.to(m.id).emit("membres_equipe", membres));

        console.log(`[Joueur connecté] ${nomJoueur} (${classe}, ${equipe}) — ID: ${socket.id}`);
        socket.emit("rejoindre_ok", { monId: socket.id, perso, attaques: ATTAQUES[classe] });
        broadcastGameState();
    });

    socket.on("keys_update", ({ keys }) => {
        if (keysPressed[socket.id] !== undefined) keysPressed[socket.id] = keys;
    });

    socket.on("attaque1", ({ dirX, dirY, cibleX, cibleY }) => lancerAttaque(socket, "attaque1", dirX, dirY, cibleX, cibleY));
    socket.on("attaque3", ({ dirX, dirY, cibleX, cibleY }) => lancerAttaque(socket, "attaque3", dirX, dirY, cibleX, cibleY));

    // Attaque2 : normal pour toutes les classes sauf héro (bouclier maintenu)
    socket.on("attaque2", ({ dirX, dirY, cibleX, cibleY }) => {
        const tireur = joueurs[socket.id];
        if (!tireur) return;
        const stats = ATTAQUES[tireur.classe]?.attaque2;
        if (!stats) return;

        if (stats.type === "bouclier") return; // géré par bouclier_activer / desactiver
        lancerAttaque(socket, "attaque2", dirX, dirY, cibleX, cibleY);
    });

    // Bouclier héro : mousedown droit → activer, mouseup droit → désactiver
    socket.on("bouclier_activer", () => {
        const tireur = joueurs[socket.id];
        if (!tireur || tireur.classe !== "hero") return;
        if (effets[socket.id]?.bouclier?.actif) return; // déjà actif

        // Vérifie le cooldown
        if (!verifierCooldown(socket.id, "attaque2", ATTAQUES.hero.attaque2.cooldown)) {
            const restant = ATTAQUES.hero.attaque2.cooldown - (Date.now() - (cooldowns[socket.id]?.["attaque2"] ?? 0));
            socket.emit("cooldown_actif", { attaque: "attaque2", restantMs: restant });
            return;
        }

        if (!effets[socket.id]) effets[socket.id] = {};
        effets[socket.id].bouclier = {
            actif: true,
            finAt: Date.now() + ATTAQUES.hero.attaque2.dureeMax,
        };
        console.log(`[Bouclier] ${tireur.nomJoueur} active le bouclier`);
        socket.emit("bouclier_etat", { actif: true, dureeMax: ATTAQUES.hero.attaque2.dureeMax, cooldown: ATTAQUES.hero.attaque2.cooldown });
        broadcastGameState();
    });

    socket.on("bouclier_desactiver", () => {
        const tireur = joueurs[socket.id];
        if (!tireur || tireur.classe !== "hero") return;
        if (!effets[socket.id]?.bouclier?.actif) return;

        effets[socket.id].bouclier.actif = false;
        console.log(`[Bouclier] ${tireur.nomJoueur} désactive le bouclier`);

        // Lance le cooldown depuis maintenant
        cooldowns[socket.id]["attaque2"] = Date.now();
        socket.emit("attaque_ok", { attaque: "attaque2", cooldown: ATTAQUES.hero.attaque2.cooldown });
        broadcastGameState();
    });

    socket.on("disconnect", () => {
        const perso = joueurs[socket.id];
        const nom = perso ? `${perso.nomJoueur} (${perso.classe})` : socket.id;
        console.log(`[Déconnexion] ${nom} a quitté la partie.`);
        delete joueurs[socket.id]; delete keysPressed[socket.id];
        delete cooldowns[socket.id]; delete effets[socket.id];
        for (const [pid, proj] of Object.entries(projectiles)) { if (proj.lanceurId === socket.id) delete projectiles[pid]; }
        for (const [zid, zone] of Object.entries(zonesActives)) { if (zone.lanceurId === socket.id) delete zonesActives[zid]; }
        for (const equipe in equipesEnAttente) {
            equipesEnAttente[equipe] = equipesEnAttente[equipe].filter(m => m.id !== socket.id);
            const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
            equipesEnAttente[equipe].forEach(m => io.to(m.id).emit("membres_equipe", membres));
        }
        io.emit("joueur_parti", { id: socket.id });
        broadcastGameState();
    });
});

app.use(express.static("public"));
server.listen(3004, () => console.log("Serveur démarré sur http://localhost:3004"));

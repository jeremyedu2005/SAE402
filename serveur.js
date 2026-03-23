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
const ARENA_WIDTH  = 2500;
const ARENA_HEIGHT = 2500;
const CHAR_SIZE    = 50;

//==============================================
// OBSTACLES — polygones convexes
//
// Chaque obstacle est défini par ses sommets : { pts: [[x1,y1],[x2,y2],...] }
// Les points doivent être dans l'ordre (horaire ou anti-horaire), polygone CONVEXE.
//   Rectangle axe-aligné : pts: [[100,200],[300,200],[300,240],[100,240]]
//   Mur diagonal :         pts: [[100,100],[300,120],[295,160],[95,140]]
//   Triangle :             pts: [[400,300],[600,300],[500,500]]
//==============================================
const OBSTACLES = [
    { pts: [[2300,0],[2300,2500],[2500,2500],[2500,0]] },   
    { pts: [[2050,980],[2050,1350],[2500,1350],[2500,980]] },   
    { pts: [[2180,1350],[2180,2500],[2500,2500],[2500,0]] }, 
    { pts: [[0,2040],[2180,2050],[2500,2500],[0,2500]] }, 
    { pts: [[680,2040],[680,1777],[560,1623],[300,1570],[0,1570],[0,2040]] }, 
    { pts: [[256,1570],[256,875],[0,875],[0,1570]] }, 
    { pts: [[0,713],[143,713],[250,600],[378,457],[378,0],[0,0]] }, 
    { pts: [[378,426],[1560,426],[2500,0],[378,0]] }, 
    { pts: [[1560,426],[1500,576],[1524,642],[1707,888],[2050,980],[2500,980],[2500,0]] },
    { pts: [[1500,576],[1524,642],[1707,888]] },
    { pts: [[524,1024],[605,968],[707,1000],[722,1007],[740,1070],[660,1109],[516,1080]] },
    { pts: [[256,1068],[374,1244],[254,1309]] },
    { pts: [[410,1146],[490,1173],[507,1252],[497,1309],[376,1332],[254,1309]] },
    { pts: [[1150,1375],[1300,1363],[1313,1388],[1240,1458],[1156,1426]] },
    { pts: [[2180,1975],[1970,1975],[2006,1669],[2180,1714]] },
    { pts: [[1973,1943],[1828,1879],[1828,1758],[2006,1669]] },
    { pts: [[1828,1879],[1666,1879],[1647,1775],[1828,1758]] },
    { pts: [[1615,1575],[1761,1513],[1788,1564],[1707,1627],[1615,1627]] },
    { pts: [[960,660],[1141,558],[1141,0],[821,650],[810,576]] },
    
];

// --- SAT (Separating Axis Theorem) ---
function projeterPolygone(pts, nx, ny) {
    let min = Infinity, max = -Infinity;
    for (const [px, py] of pts) {
        const d = px * nx + py * ny;
        if (d < min) min = d;
        if (d > max) max = d;
    }
    return [min, max];
}
function axesPolygone(pts) {
    const axes = [];
    for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const ex = bx - ax, ey = by - ay;
        const len = Math.sqrt(ex * ex + ey * ey);
        if (len > 0) axes.push([-ey / len, ex / len]);
    }
    return axes;
}
function polygonesSeChevauchent(ptsA, ptsB) {
    for (const [nx, ny] of [...axesPolygone(ptsA), ...axesPolygone(ptsB)]) {
        const [minA, maxA] = projeterPolygone(ptsA, nx, ny);
        const [minB, maxB] = projeterPolygone(ptsB, nx, ny);
        if (maxA < minB || maxB < minA) return false;
    }
    return true;
}
function rectEnPts(px, py, w, h) {
    return [[px, py], [px + w, py], [px + w, py + h], [px, py + h]];
}
function cercleEnPts(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}
// Teste si le rectangle d'un joueur touche un obstacle
function collisionObstacle(px, py, pw, ph) {
    const rect = rectEnPts(px, py, pw, ph);
    for (const o of OBSTACLES) {
        if (polygonesSeChevauchent(rect, o.pts)) return true;
    }
    return false;
}
// Teste si un projectile (cercle) touche un obstacle
function pointDansObstacle(cx, cy, r) {
    const cercle = cercleEnPts(cx, cy, r);
    for (const o of OBSTACLES) {
        if (polygonesSeChevauchent(cercle, o.pts)) return true;
    }
    return false;
}

const CLASSES = {
    hero:       { pv: 300, resistance: 20, couleur: "#5121ffff" },
    mage_feu:   { pv: 200, resistance: 10, couleur: "#ff6600" },
    mage_glace: { pv: 200, resistance: 10, couleur: "#88ddff" },
    archer:     { pv: 220, resistance: 12, couleur: "#27ae60" },
    guerrier:   { pv: 400, resistance: 30, couleur: "#e67e22" },
    goblin:     { pv: 160, resistance: 15, couleur: "#44cc44", vitesse: 1.5 }, // rapide, fragile
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
            dureeMax: 3000, cooldown: 5000, speedMult: 0.3,
            couleur: "#00aaff", label: "Bouclier",
        },
        attaque3: {
            type: "dash",
            distance: 300, cooldown: 2000,
            vitesseDash: 30, dureeDash: 160,
            couleur: "#ffffff", label: "Dash",
        },
    },

    // --------------------------------------------------
    // MAGE DE FEU 
    // --------------------------------------------------
    mage_feu: {
        attaque1: {
            type: "projectile",
            degats: 55, vitesse: 8, taille: 18,
            dureeMax: 3000, disparitAuContact: true,
            cooldown: 500, couleur: "#ff6600", label: "Boule de feu",
            sprite: "bouledefeu.png",
        },
        attaque2: {
            // Météore : zone météorite + laisse une zone de brulure persistante
            type: "zone_combo",
            // Phase 1 : impact de météorite
            impact: {
                forme: "meteorite", degats: 70, resistance_mult: 1,
                rayon: 130, dureeAffichage: 500, couleur: "#ff4400",
            },
            // Phase 2 : brûlure persistante centrée sur le même point
            persistant: {
                forme: "cercle_persistant",
                degats: 8,          // dégâts par tick
                resistance_mult: 0.5,
                rayon: 110,
                duree: 4000,        // durée totale en ms
                tickRate: 500,      // dégâts toutes les 500ms
                couleur: "#ff7700",
                dureeAffichage: 4000,
            },
            cooldown: 4000, couleur: "#ff4400", label: "Météore",
            telegraphe: { delai: 500, couleur: "#ff4400" },
        },
        attaque3: {
            type: "dash",
            distance: 500, cooldown: 6000,
            estTeleportation: true,
            couleur: "#ff8844", label: "Téléportation",
        },
    },

    // --------------------------------------------------
    // MAGE DE GLACE
    // --------------------------------------------------
    mage_glace: {
        attaque1: {
            // Projectile qui explose en éventail après une courte distance
            type: "projectile_explosif",
            // Le projectile principal
            degats: 15, vitesse: 10, taille: 14,
            dureeMax: 1000,            // courte durée → explose rapidement
            disparitAuContact: true,
            couleur: "#aaeeff",
            // Config de l'explosion : projette N éclats en éventail
            explosion: {
                nbEclats:   12,        // nombre de projectiles secondaires
                angleTotal: 360,      // dégré total de l'éventail
                degats:     20,
                vitesse:    14,
                taille:     8,
                dureeMax:   800,
                couleur:    "#ccffff",
                disparitAuContact: true,
            },
            cooldown: 700, couleur: "#aaeeff", label: "Éclats de glace",
        },
        attaque2: {
            type: "zone", forme: "laser",
            degats: 80, resistance_mult: 0.5,
            longueur: 1500, largeur: 50,
            dureeAffichage: 400, cooldown: 2000,
            couleur: "#88ddff", label: "Rayon de glace",
            telegraphe: { delai: 300, couleur: "#88ddff" },
        },
        attaque3: {
            type: "dash",
            distance: 500, cooldown: 6000,
            estTeleportation: true,
            couleur: "#88ddff", label: "Téléportation",
        },
    },

    archer: {
        attaque1: {
            type: "projectile",
            degats: 40, vitesse: 18, taille: 12,
            dureeMax: 1500, disparitAuContact: true,
            cooldown: 400, couleur: "#2ecc71", label: "Flèche",
            sprite: "fleche.png",
        },
        attaque2: {
            type: "zone", forme: "meteorite",
            degats: 50, resistance_mult: 1,
            rayon: 120, dureeAffichage: 1200, cooldown: 3000,
            couleur: "#f1c40f", label: "Pluie de flèches",
            sprite: "pluiedefleches.png",
            telegraphe: { delai: 500, couleur: "#f1c40f" },
        },
        attaque3: {
            type: "dash",
            distance: 350, cooldown: 3500,
            vitesseDash: 30, dureeDash: 190,
            couleur: "#aaffaa", label: "Dash",
        },
    },
    goblin: {
        attaque1: {
            // Laser courte portée — applique un ralentissement à la cible touchée
            type: "zone", forme: "laser",
            degats: 35, resistance_mult: 1,
            longueur: 120, largeur: 50,
            dureeAffichage: 150, cooldown: 600,
            couleur: "#88ff44",
            label: "Poignardage",
            // Effet appliqué aux joueurs touchés
            effet_touche: {
                type: "ralenti",
                mult: 0.4,      // vitesse réduite à 40%
                duree: 2000,    // 2 secondes
            },
        },
        attaque2: {
            // Laser courte portée — applique un poison (dégâts sur la durée)
            type: "zone", forme: "laser",
            degats: 20, resistance_mult: 1,
            longueur: 120, largeur: 50,
            dureeAffichage: 150, cooldown: 1000,
            couleur: "#aa44ff",
            label: "Poignard empoisonné",
            // Poison : zone persistante sur le joueur touché (simulé comme une brûlure courte)
            effet_touche: {
                type: "poison",
                degats: 5,          // dégâts/tick
                resistance_mult: 0, // ignore la résistance
                duree: 3000,
                tickRate: 500,
                couleur: "#aa44ff",
            },
        },
        attaque3: {
            type: "double_dash",
            distance: 280, cooldown: 3000,
            vitesseDash: 32, dureeDash: 150,
            fenetreSec: 2000,   // délai max entre les deux dashes
            couleur: "#88ff44", label: "Double Dash",
        },
    },

    guerrier: {
        attaque1: {
            type: "zone", forme: "arc",
            degats: 80, resistance_mult: 1,
            rayon: 100, angleOuverture: 90,
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
            duree: 2000, speedMult: 2.5, cooldown: 4000,
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
        this.sprite = stats.sprite || null;
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
        return { id: this.id, x: this.x, y: this.y, taille: this.taille, couleur: this.couleur, classe: this.classe, dirX: this.dirX, dirY: this.dirY, sprite: this.sprite};
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
        this.effet_touche   = stats.effet_touche   ?? null;
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
// CLASSE TELEGRAPHE
// Zone visuelle temporaire (0 dégâts) qui précède un sort.
// À son expiration, le serveur déclenche l'attaque réelle.
//==============================================
let telegrapheIdCounter = 0;

class Telegraphe {
    constructor({ id, lanceurId, socketId, equipe, classe, delai, forme, couleur,
                  tireurX, tireurY, dirX, dirY, cibleX, cibleY,
                  rayon, angleOuverture, longueur, largeur,
                  nomAttaque, statsAttaque }) {
        this.id         = ++telegrapheIdCounter;
        this.socketId   = socketId;
        this.lanceurId  = lanceurId;
        this.equipe     = equipe;
        this.classe     = classe;
        this.delai      = delai;
        this.forme      = forme;
        this.couleur    = couleur;
        this.tireurX    = tireurX; this.tireurY = tireurY;
        this.dirX       = dirX;   this.dirY    = dirY;
        this.cibleX     = cibleX; this.cibleY  = cibleY;
        this.rayon           = rayon          ?? 0;
        this.angleOuverture  = angleOuverture ?? 90;
        this.longueur        = longueur       ?? 300;
        this.largeur         = largeur        ?? 20;
        this.nomAttaque      = nomAttaque;
        this.statsAttaque    = statsAttaque;   // stats complètes pour déclencher l'attaque
        this.createdAt  = Date.now();
    }

    estExpire() { return Date.now() - this.createdAt >= this.delai; }

    // Ratio [0..1] de progression du délai (pour animation côté client)
    ratioProgression() { return Math.min((Date.now() - this.createdAt) / this.delai, 1); }

    toJSON() {
        return {
            id: this.id, forme: this.forme, couleur: this.couleur,
            tireurX: this.tireurX, tireurY: this.tireurY,
            dirX: this.dirX, dirY: this.dirY,
            cibleX: this.cibleX, cibleY: this.cibleY,
            rayon: this.rayon, angleOuverture: this.angleOuverture,
            longueur: this.longueur, largeur: this.largeur,
            ratio: this.ratioProgression(),
        };
    }
}

//==============================================
// CLASSE ZONE PERSISTANTE (brûlure, poison, etc.)
// Fait des dégâts répétés à intervalles réguliers pendant sa durée de vie.
//==============================================
let zonePersistanteIdCounter = 0;

class ZonePersistante {
    constructor({ lanceurId, equipe, x, y, stats }) {
        this.id         = ++zonePersistanteIdCounter;
        this.lanceurId  = lanceurId;
        this.equipe     = equipe;
        this.x = x; this.y = y;          // centre de la zone
        this.forme      = stats.forme;    // "cercle_persistant"
        this.rayon      = stats.rayon;
        this.degats     = stats.degats;
        this.resistance_mult = stats.resistance_mult ?? 1;
        this.couleur    = stats.couleur;
        this.duree      = stats.duree;
        this.tickRate   = stats.tickRate; // ms entre deux ticks de dégâts
        this.dureeAffichage = stats.dureeAffichage ?? stats.duree;
        this.createdAt  = Date.now();
        this.dernierTick = Date.now();
    }

    estExpire() { return Date.now() - this.createdAt > this.duree; }

    // Retourne true si un tick de dégâts doit être appliqué maintenant
    doitFaireDegats() {
        const now = Date.now();
        if (now - this.dernierTick >= this.tickRate) {
            this.dernierTick = now;
            return true;
        }
        return false;
    }

    toucheJoueur(joueur) {
        const cx = joueur.x + CHAR_SIZE / 2;
        const cy = joueur.y + CHAR_SIZE / 2;
        return Math.sqrt((cx - this.x) ** 2 + (cy - this.y) ** 2) < this.rayon + CHAR_SIZE / 2;
    }

    toJSON() {
        const elapsed = Date.now() - this.createdAt;
        const ratioRestant = Math.max(0, 1 - elapsed / this.duree);
        return {
            id: this.id, x: this.x, y: this.y,
            rayon: this.rayon, couleur: this.couleur,
            ratioRestant, // pour le client : opacité qui diminue
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
const zonesPersistantes  = {};  // id -> ZonePersistante
const telegraphesActifs  = {};  // id -> Telegraphe
const equipesEnAttente = { blue: [], red: [] };
const cooldowns        = {};

// Score des équipes
const SCORE_VICTOIRE = 5;
const scores = { blue: 0, red: 0 };
let partieTerminee = false;

// États spéciaux actifs : bouclier, boost
// effets[socketId] = { bouclier: { actif, finAt }, boost: { actif, finAt, speedMult } }
const effets = {};

// Historique du chat — en mémoire pour toute la durée de vie du serveur
const historicChat      = [];
const CHAT_HISTORIQUE_MAX = 200;

const SPAWN_ZONES = {
    blue: { xMin: 450,   yMin: 500,  xMax: 800,  yMax: 800 },
    red:  { xMin: 1200, yMin: 1700,  xMax: 1550, yMax: 1900  },
};

function positionSpawnSure(equipe) {
    const zone = SPAWN_ZONES[equipe] || { xMin: 100, yMin: 100, xMax: ARENA_WIDTH - 200, yMax: ARENA_HEIGHT - 200 };
    for (let tentative = 0; tentative < 50; tentative++) {
        const x = Math.floor(Math.random() * (zone.xMax - zone.xMin - CHAR_SIZE)) + zone.xMin;
        const y = Math.floor(Math.random() * (zone.yMax - zone.yMin - CHAR_SIZE)) + zone.yMin;
        if (!collisionObstacle(x, y, CHAR_SIZE, CHAR_SIZE)) return { x, y };
    }
    // Fallback : position fixe connue libre
    return equipe === "blue" ? { x: 80, y: 1000 } : { x: 2100, y: 600 };
}

function creerPersonnage(socketId, nomJoueur, classe, equipe) {
    const stats = CLASSES[classe] || CLASSES.hero;
    const { x, y } = positionSpawnSure(equipe);
    let couleur = stats.couleur;
    if (equipe === "blue") couleur = "#0080ff";
    if (equipe === "red")  couleur = "#ff4040";
    return { id: socketId, nomJoueur, classe, equipe, pv: stats.pv, pvMax: stats.pv, resistance: stats.resistance, vitesseMult: stats.vitesse ?? 1, couleur, x, y };
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
        if (joueur.pv <= 0 || joueur.estMort) continue;
        // Ignore les joueurs avec bouclier ou dash actif
        if (effets[joueur.id]?.bouclier?.actif) continue;
        if (effets[joueur.id]?.dash?.actif)     continue;
        if (zone.toucheJoueur(joueur)) {
            if (joueur.estMort) continue; // tué par une autre source ce même tick
            zone.victimesImpactees.add(joueur.id);
            const degats = Math.max(zone.degats - joueur.resistance * zone.resistance_mult, 0);
            joueur.pv = Math.max(0, joueur.pv - degats);
            const lanceur = joueurs[zone.lanceurId];
            const lanceurNom = lanceur ? lanceur.nomJoueur : "Inconnu";
            console.log(`[Zone ${zone.forme}] ${lanceurNom} → ${joueur.nomJoueur} : ${degats} dégâts (PV: ${joueur.pv}/${joueur.pvMax})`);
            if (joueur.pv <= 0) {
                console.log(`[Mort] ${joueur.nomJoueur} éliminé par ${lanceurNom} !`);
                handleKill(zone.lanceurId, joueur.id);
            }
            // Appliquer l'effet sur la cible si la zone en a un
            if (zone.effet_touche) {
                if (!effets[joueur.id]) effets[joueur.id] = {};
                const et = zone.effet_touche;
                if (et.type === "ralenti") {
                    effets[joueur.id].ralenti = { actif: true, mult: et.mult, finAt: Date.now() + et.duree };
                    console.log(`[Ralenti] ${joueur.nomJoueur} ralenti pour ${et.duree}ms`);
                } else if (et.type === "poison") {
                    // Crée une zone persistante de poison centrée sur le joueur — elle se déplace avec lui
                    // Note : simplification — le poison est posé à la position actuelle, pas mobile
                    const zpId = ++zonePersistanteIdCounter;
                    const zp = Object.create(ZonePersistante.prototype);
                    Object.assign(zp, {
                        id: zpId, lanceurId: zone.lanceurId, equipe: zone.equipe,
                        x: joueur.x + CHAR_SIZE / 2, y: joueur.y + CHAR_SIZE / 2,
                        forme: "cercle_persistant", rayon: 1,
                        degats: et.degats, resistance_mult: et.resistance_mult ?? 0,
                        couleur: et.couleur, duree: et.duree, tickRate: et.tickRate,
                        dureeAffichage: et.duree, createdAt: Date.now(), dernierTick: Date.now(),
                        // Surcharge : touche uniquement ce joueur spécifique (pas de rayon)
                        cibleId: joueur.id,
                        estExpire() { return Date.now() - this.createdAt > this.duree; },
                        doitFaireDegats() {
                            const now = Date.now();
                            if (now - this.dernierTick >= this.tickRate) { this.dernierTick = now; return true; }
                            return false;
                        },
                        toucheJoueur(j) { return j.id === this.cibleId; },
                        toJSON() {
                            const elapsed = Date.now() - this.createdAt;
                            return { id: this.id, x: joueur.x + CHAR_SIZE/2, y: joueur.y + CHAR_SIZE/2,
                                     rayon: 18, couleur: this.couleur,
                                     ratioRestant: Math.max(0, 1 - elapsed / this.duree) };
                        },
                    });
                    zonesPersistantes[zpId] = zp;
                    console.log(`[Poison] ${joueur.nomJoueur} empoisonné pour ${et.duree}ms`);
                }
            }
        }
    }
}

function handleKill(lanceurId, victimeId) {
    const lanceur = joueurs[lanceurId];
    const victime = joueurs[victimeId];
    if (!lanceur || !victime) return;
    if (partieTerminee) return;
    if (victime.estMort) return;

    victime.estMort = true;  // verrou anti-double kill

    // Ajoute un point à l'équipe du tueur
    scores[lanceur.equipe] = (scores[lanceur.equipe] || 0) + 1;
    console.log(`[Score] ${lanceur.nomJoueur} (${lanceur.equipe}) tue ${victime.nomJoueur} — Score: Bleu ${scores.blue} / Rouge ${scores.red}`);

    io.emit("joueur_elimine", {
        victimeId: victime.id,
        tueurNom:  lanceur.nomJoueur,
        victimeNom: victime.nomJoueur,
        scores:    { ...scores },
    });

    // Force un broadcast immédiat avec le nouveau score
    broadcastGameState();

    // Envoie l'écran de mort au joueur tué (il doit cliquer pour respawn)
    io.to(victimeId).emit("tu_es_mort");

    // Vérifie victoire
    if (scores[lanceur.equipe] >= SCORE_VICTOIRE) {
        partieTerminee = true;
        console.log(`[Victoire] Équipe ${lanceur.equipe} gagne !`);
        io.emit("partie_terminee", { equipeGagnante: lanceur.equipe, scores: { ...scores } });

        // Réinitialise l'état serveur après 10 secondes (le temps que les clients se déconnectent)
        setTimeout(() => {
            scores.blue    = 0;
            scores.red     = 0;
            partieTerminee = false;
            console.log("[Partie] État serveur réinitialisé.");
        }, 10000);
    }
}

function broadcastGameState() {
    io.emit("game_state", {
        joueurs:     Object.values(joueurs).map(j => ({
            ...j,
            // Envoie les états spéciaux pour le rendu client
            bouclierActif: effets[j.id]?.bouclier?.actif ?? false,
            boostActif:    effets[j.id]?.boost?.actif    ?? false,
            dashActif:     effets[j.id]?.dash?.actif     ?? false,
            dashCouleur:   effets[j.id]?.dash?.actif ? (ATTAQUES[j.classe]?.attaque3?.couleur ?? "#fff") : null,
            ralentiActif:  effets[j.id]?.ralenti?.actif ?? false,
            facingX:       j.facingX ?? 1,
            isMoving:      !!(keysPressed[j.id]?.["z"] || keysPressed[j.id]?.["s"] ||
                              keysPressed[j.id]?.["q"] || keysPressed[j.id]?.["d"] ||
                              effets[j.id]?.dash?.actif),
        })),
        projectiles:       Object.values(projectiles).map(p => p.toJSON()),
        zones:             Object.values(zonesActives).map(z => z.toJSON()),
        zonesPersistantes: Object.values(zonesPersistantes).map(z => z.toJSON()),
        telegraphes:       Object.values(telegraphesActifs).map(t => t.toJSON()),
        obstacles:         OBSTACLES,
        scores:            { ...scores },
    });
}

//==============================================
// UTILITAIRE : explosion d'un projectile en éclats
//==============================================
function creerEclats(proj) {
    if (!proj.explosion) return;
    const cfg      = proj.explosion;
    const nbEclats = cfg.nbEclats ?? 6;
    const demiAngle = (cfg.angleTotal ?? 120) / 2 * Math.PI / 180;
    const angleBase = Math.atan2(proj.dirY, proj.dirX);

    for (let i = 0; i < nbEclats; i++) {
        const t   = nbEclats === 1 ? 0 : (i / (nbEclats - 1)) - 0.5; // [-0.5 .. 0.5]
        const ang = angleBase + t * demiAngle * 2;
        const eclat = new Projectile({
            lanceurId: proj.lanceurId,
            equipe:    proj.equipe,
            classe:    proj.classe,
            x: proj.x, y: proj.y,
            dirX: Math.cos(ang), dirY: Math.sin(ang),
            stats: {
                degats:            cfg.degats,
                vitesse:           cfg.vitesse,
                taille:            cfg.taille,
                dureeMax:          cfg.dureeMax,
                disparitAuContact: cfg.disparitAuContact,
                couleur:           cfg.couleur,
                sprite:            cfg.sprite || null,
            },
        });
        projectiles[eclat.id] = eclat;
    }
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
        // Ralenti (poignardage goblin) : expire automatiquement
        if (effet.ralenti?.actif && now >= effet.ralenti.finAt) {
            effet.ralenti.actif = false;
            dirty = true;
        }
        // Dash animé : expire → pose le cooldown et informe le client
        if (effet.dash?.actif && now >= effet.dash.finAt) {
            effet.dash.actif = false;
            const joueur = joueurs[sid];
            if (joueur) {
                cooldowns[sid] = cooldowns[sid] || {};
                if (effet.dash.cooldown > 0) {
                    // Cooldown réel (2e dash ou dash normal)
                    cooldowns[sid]["attaque3"] = now;
                    io.to(sid).emit("attaque_ok", { attaque: "attaque3", cooldown: effet.dash.cooldown });
                } else {
                    // 1er dash du double : pas de cooldown, mais informe quand même le client
                    // qu'il peut relancer (case HUD disponible)
                    io.to(sid).emit("double_dash_pret");
                }
                console.log(`[Dash] ${joueur.nomJoueur} — fin du dash`);
                io.to(sid).emit("dash_fin");
            }
            dirty = true;
        }

        // Fenêtre du double dash expirée sans 2e dash → lance le cooldown
        if (effet.doubleDash?.charges === 1 && now >= effet.doubleDash.fenetreFinAt) {
            effet.doubleDash.charges = 0;
            const joueur = joueurs[sid];
            if (joueur) {
                const statsDash = ATTAQUES[joueur.classe]?.attaque3;
                if (statsDash) {
                    cooldowns[sid]["attaque3"] = now;
                    io.to(sid).emit("attaque_ok", { attaque: "attaque3", cooldown: statsDash.cooldown });
                    io.to(sid).emit("double_dash_fenetre_expiree");
                    console.log(`[DoubleDash] ${joueur.nomJoueur} — fenêtre expirée, cooldown lancé`);
                }
            }
            dirty = true;
        }
    }

    // --- Déplacement joueurs ---
    for (const [socketId, keys] of Object.entries(keysPressed)) {
        const perso = joueurs[socketId];
        if (!perso || perso.pv <= 0) continue;

        // Dash animé en cours : déplacement forcé, inputs ignorés
        if (effets[socketId]?.dash?.actif) {
            const dash = effets[socketId].dash;
            const dNewX = Math.max(0, Math.min(ARENA_WIDTH  - CHAR_SIZE, perso.x + dash.dirX * dash.vitesse));
            const dNewY = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, perso.y + dash.dirY * dash.vitesse));
            if (!collisionObstacle(dNewX, perso.y, CHAR_SIZE, CHAR_SIZE)) perso.x = dNewX;
            if (!collisionObstacle(perso.x, dNewY, CHAR_SIZE, CHAR_SIZE)) perso.y = dNewY;
            if (dash.dirX !== 0) perso.facingX = dash.dirX > 0 ? 1 : -1;
            dirty = true;
            continue;
        }

        let moveX = 0, moveY = 0;
        if (keys["z"]) moveY -= 1;
        if (keys["s"]) moveY += 1;
        if (keys["q"]) moveX -= 1;
        if (keys["d"]) moveX += 1;
        if (moveX === 0 && moveY === 0) continue;

        dirty = true;
        const length = Math.sqrt(moveX * moveX + moveY * moveY);

        // Calcule la vitesse effective (bouclier = ralenti, boost = accéléré, vitesseMult = stat de classe)
        let speedMult = perso.vitesseMult ?? 1;
        if (effets[socketId]?.bouclier?.actif) speedMult = ATTAQUES[perso.classe]?.attaque2?.speedMult ?? 0.3;
        if (effets[socketId]?.boost?.actif)    speedMult = effets[socketId].boost.speedMult;
        if (effets[socketId]?.ralenti?.actif)  speedMult *= effets[socketId].ralenti.mult;

        const newX = Math.max(0, Math.min(ARENA_WIDTH  - CHAR_SIZE, perso.x + (moveX / length) * SPEED_BASE * speedMult));
        const newY = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, perso.y + (moveY / length) * SPEED_BASE * speedMult));
        if (!collisionObstacle(newX, perso.y, CHAR_SIZE, CHAR_SIZE)) perso.x = newX;
        if (!collisionObstacle(perso.x, newY, CHAR_SIZE, CHAR_SIZE)) perso.y = newY;
        // Mémorise la direction horizontale pour l'animation côté client
        if (moveX !== 0) perso.facingX = moveX > 0 ? 1 : -1;
    }

    // --- Projectiles ---
    for (const [pid, proj] of Object.entries(projectiles)) {
        if (!proj.actif) { delete projectiles[pid]; dirty = true; continue; }
        proj.avancer();
        if (proj.estExpire()) {
            // Explosion à l'expiration (fin de portée)
            if (proj.explosion) creerEclats(proj);
            delete projectiles[pid]; dirty = true; continue;
        }
        // Collision avec un obstacle
        if (pointDansObstacle(proj.x, proj.y, proj.taille)) {
            if (proj.explosion) creerEclats(proj);
            delete projectiles[pid]; dirty = true; continue;
        }
        for (const joueur of Object.values(joueurs)) {
            if (joueur.id === proj.lanceurId) continue;
            if (joueur.equipe === proj.equipe) continue;
            if (joueur.pv <= 0 || joueur.estMort) continue;

            // Invincible pendant le dash
            if (effets[joueur.id]?.dash?.actif) continue;

            // Bouclier actif : détruit les projectiles destructibles qui touchent le joueur
            if (effets[joueur.id]?.bouclier?.actif) {
                if (proj.disparitAuContact && proj.toucheJoueur(joueur)) {
                    const lanceur = joueurs[proj.lanceurId];
                    console.log(`[Bouclier] ${joueur.nomJoueur} détruit le projectile de ${lanceur?.nomJoueur ?? "Inconnu"}`);
                    if (proj.explosion) creerEclats(proj); // explose même sur bouclier
                    delete projectiles[pid];
                    dirty = true;
                }
                continue;
            }

            if (proj.toucheJoueur(joueur)) {
                if (joueur.estMort) break; // tué par une autre source ce même tick
                const degats = Math.max(proj.degats - joueur.resistance, 0);
                joueur.pv = Math.max(0, joueur.pv - degats);
                const lanceur = joueurs[proj.lanceurId];
                const lanceurNom = lanceur ? lanceur.nomJoueur : "Inconnu";
                console.log(`[Projectile] ${lanceurNom} → ${joueur.nomJoueur} : ${degats} dégâts (PV: ${joueur.pv}/${joueur.pvMax})`);
                if (joueur.pv <= 0) {
                    console.log(`[Mort] ${joueur.nomJoueur} éliminé par ${lanceurNom} !`);
                    handleKill(proj.lanceurId, joueur.id);
                }
                if (proj.disparitAuContact) {
                    if (proj.explosion) creerEclats(proj); // explose à l'impact
                    delete projectiles[pid];
                }
                dirty = true;
                break;
            }
        }
        dirty = true;
    }

    // --- Zones instantanées : expiration ---
    for (const [zid, zone] of Object.entries(zonesActives)) {
        if (zone.estExpire()) { delete zonesActives[zid]; }
        dirty = true;
    }

    // --- Zones persistantes : dégâts par tick + expiration ---
    for (const [zid, zone] of Object.entries(zonesPersistantes)) {
        if (zone.estExpire()) {
            delete zonesPersistantes[zid];
            dirty = true;
            continue;
        }
        if (zone.doitFaireDegats()) {
            for (const joueur of Object.values(joueurs)) {
                if (joueur.id === zone.lanceurId) continue;
                if (joueur.equipe === zone.equipe) continue;
                if (joueur.pv <= 0 || joueur.estMort) continue;
                if (effets[joueur.id]?.bouclier?.actif) continue;
                if (effets[joueur.id]?.dash?.actif)     continue;
                if (zone.toucheJoueur(joueur)) {
                    const degats = Math.max(zone.degats - joueur.resistance * zone.resistance_mult, 0);
                    joueur.pv = Math.max(0, joueur.pv - degats);
                    const lanceur = joueurs[zone.lanceurId];
                    const lanceurNom = lanceur ? lanceur.nomJoueur : "Inconnu";
                    console.log(`[Brûlure] ${lanceurNom} → ${joueur.nomJoueur} : ${degats} dégâts (PV: ${joueur.pv}/${joueur.pvMax})`);
                    if (joueur.pv <= 0) {
                        console.log(`[Mort] ${joueur.nomJoueur} éliminé par ${lanceurNom} !`);
                        handleKill(zone.lanceurId, joueur.id);
                    }
                }
            }
            dirty = true;
        }
        dirty = true; // pour que la progression d'opacité soit envoyée au client
    }

    // --- Télégraphes : expiration → déclenche l'attaque réelle ---
    for (const [tid, tg] of Object.entries(telegraphesActifs)) {
        dirty = true; // le ratio change à chaque tick
        if (!tg.estExpire()) continue;

        delete telegraphesActifs[tid];
        const tireur = joueurs[tg.socketId];
        if (!tireur || tireur.pv <= 0) continue; // annulé si le lanceur est mort

        const stats = tg.statsAttaque;
        console.log(`[Télégraphe expiré] ${tireur.nomJoueur} — déclenchement "${stats.label}"`);

        if (stats.type === "zone") {
            const zone = new AttaqueZone({
                lanceurId: tg.socketId, equipe: tg.equipe, classe: tg.classe,
                stats, tireurX: tg.tireurX, tireurY: tg.tireurY,
                dirX: tg.dirX, dirY: tg.dirY, cibleX: tg.cibleX, cibleY: tg.cibleY,
            });
            appliquerDegatsZone(zone);
            zonesActives[zone.id] = zone;

        } else if (stats.type === "zone_combo") {
            const impactStats = { ...stats.impact };
            const zone = new AttaqueZone({
                lanceurId: tg.socketId, equipe: tg.equipe, classe: tg.classe,
                stats: impactStats,
                tireurX: tg.tireurX, tireurY: tg.tireurY,
                dirX: tg.dirX, dirY: tg.dirY, cibleX: tg.cibleX, cibleY: tg.cibleY,
            });
            appliquerDegatsZone(zone);
            zonesActives[zone.id] = zone;

            const zp = new ZonePersistante({
                lanceurId: tg.socketId, equipe: tg.equipe,
                x: tg.cibleX, y: tg.cibleY,
                stats: stats.persistant,
            });
            zonesPersistantes[zp.id] = zp;
        }
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
    if (partieTerminee) return;

    // Pendant le bouclier ou le dash, aucune autre attaque ne peut être lancée
    if (effets[socket.id]?.bouclier?.actif && nomAttaque !== "attaque2") {
        socket.emit("cooldown_actif", { attaque: nomAttaque, restantMs: 0 });
        return;
    }
    if (effets[socket.id]?.dash?.actif) {
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

    // --- Télégraphe : si le sort a un délai d'avertissement, on crée d'abord
    //     un télégraphe visuel puis on sort. L'attaque réelle sera déclenchée
    //     automatiquement par la boucle à l'expiration du télégraphe.
    if (stats.telegraphe) {
        const tg = new Telegraphe({
            socketId:   socket.id,
            lanceurId:  socket.id,
            equipe:     tireur.equipe,
            classe:     tireur.classe,
            delai:      stats.telegraphe.delai,
            couleur:    stats.telegraphe.couleur,
            forme:      stats.forme ?? stats.impact?.forme ?? "cercle",
            tireurX: cx, tireurY: cy,
            dirX: ndx,   dirY: ndy,
            cibleX, cibleY,
            // Dimensions selon la forme du sort
            rayon:          stats.rayon          ?? stats.impact?.rayon          ?? 0,
            angleOuverture: stats.angleOuverture ?? stats.impact?.angleOuverture ?? 90,
            longueur:       stats.longueur       ?? 0,
            largeur:        stats.largeur        ?? 0,
            nomAttaque,
            statsAttaque: stats,   // stats complètes pour déclencher l'attaque à l'expiration
        });
        telegraphesActifs[tg.id] = tg;
        console.log(`[Télégraphe] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}" (délai: ${stats.telegraphe.delai}ms)`);
        socket.emit("attaque_ok", { attaque: nomAttaque, cooldown: stats.cooldown });
        return;
    }

    if (stats.type === "projectile") {
        const proj = new Projectile({ lanceurId: socket.id, equipe: tireur.equipe, classe: tireur.classe, x: cx, y: cy, dirX: ndx, dirY: ndy, stats });
        projectiles[proj.id] = proj;
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}"`);

    } else if (stats.type === "projectile_explosif") {
        // Crée le projectile principal — il sera surveille dans la boucle
        // pour exploser quand dureeMax expire ou à l'impact
        const proj = new Projectile({
            lanceurId: socket.id, equipe: tireur.equipe, classe: tireur.classe,
            x: cx, y: cy, dirX: ndx, dirY: ndy, stats,
        });
        proj.explosion = stats.explosion; // stocke la config d'explosion
        projectiles[proj.id] = proj;
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}"`);

    } else if (stats.type === "zone_combo") {
        // Phase 1 : impact instantané (meteorite)
        const impactStats = { ...stats.impact, forme: stats.impact.forme };
        const zone = new AttaqueZone({
            lanceurId: socket.id, equipe: tireur.equipe, classe: tireur.classe,
            stats: impactStats,
            tireurX: cx, tireurY: cy,
            dirX: ndx, dirY: ndy,
            cibleX, cibleY,
        });
        appliquerDegatsZone(zone);
        zonesActives[zone.id] = zone;

        // Phase 2 : zone persistante centrée sur le point cliqué
        const zp = new ZonePersistante({
            lanceurId: socket.id, equipe: tireur.equipe,
            x: cibleX, y: cibleY,
            stats: stats.persistant,
        });
        zonesPersistantes[zp.id] = zp;
        console.log(`[${nomAttaque}] ${tireur.nomJoueur} (${tireur.classe}) — "${stats.label}" (impact + brûlure)`);

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
        if (dx === 0 && dy === 0) { dx = ndx; dy = ndy; }
        const dLen = Math.sqrt(dx * dx + dy * dy);
        if (dLen === 0) return;

        if (stats.estTeleportation) {
            // Téléportation instantanée : avance par pas pour s'arrêter avant un obstacle
            const stepSize = CHAR_SIZE / 2;
            const totalSteps = Math.ceil(stats.distance / stepSize);
            const stepX = (dx / dLen) * stepSize;
            const stepY = (dy / dLen) * stepSize;
            let destX = tireur.x;
            let destY = tireur.y;
            for (let i = 0; i < totalSteps; i++) {
                const nextX = Math.max(0, Math.min(ARENA_WIDTH  - CHAR_SIZE, destX + stepX));
                const nextY = Math.max(0, Math.min(ARENA_HEIGHT - CHAR_SIZE, destY + stepY));
                if (collisionObstacle(nextX, nextY, CHAR_SIZE, CHAR_SIZE)) break;
                destX = nextX;
                destY = nextY;
            }
            tireur.x = destX;
            tireur.y = destY;
            console.log(`[${nomAttaque}] ${tireur.nomJoueur} — "${stats.label}" (téléportation)`);
            broadcastGameState();
        } else {
            // Dash animé : stocke l'état, la boucle gère le déplacement frame par frame
            if (!effets[socket.id]) effets[socket.id] = {};
            effets[socket.id].dash = {
                actif:    true,
                dirX:     dx / dLen,
                dirY:     dy / dLen,
                vitesse:  stats.vitesseDash,
                finAt:    Date.now() + stats.dureeDash,
                cooldown: stats.cooldown,
            };
            // Le cooldown sera posé à la FIN du dash — on annule celui posé par verifierCooldown
            cooldowns[socket.id][nomAttaque] = 0;
            console.log(`[${nomAttaque}] ${tireur.nomJoueur} — "${stats.label}" (dash animé)`);
            socket.emit("dash_debut", { couleur: stats.couleur });
            // attaque_ok sera émis à la fin du dash par la boucle d'expiration
            return; // on sort avant l'emit attaque_ok ci-dessous
        }

    } else if (stats.type === "double_dash") {
        const keys = keysPressed[socket.id] || {};
        let dx = 0, dy = 0;
        if (keys["z"]) dy -= 1; if (keys["s"]) dy += 1;
        if (keys["q"]) dx -= 1; if (keys["d"]) dx += 1;
        if (dx === 0 && dy === 0) { dx = ndx; dy = ndy; }
        const dLen = Math.sqrt(dx * dx + dy * dy);
        if (dLen === 0) return;

        // Récupère l'état du double dash pour ce joueur
        if (!effets[socket.id].doubleDash) effets[socket.id].doubleDash = { charges: 0, fenetreFinAt: 0 };
        const dd = effets[socket.id].doubleDash;
        const now2 = Date.now();

        // Détermine si on est dans la fenêtre du 2e dash
        const dansLaFenetre = dd.charges === 1 && now2 < dd.fenetreFinAt;

        if (dansLaFenetre) {
            // 2e dash : lance et pose le vrai cooldown
            dd.charges = 0;
            dd.fenetreFinAt = 0;
            cooldowns[socket.id]["attaque3"] = 0; // sera posé par la fin du dash
        } else {
            // 1er dash : lance et ouvre la fenêtre
            dd.charges = 1;
            dd.fenetreFinAt = now2 + stats.fenetreSec;
            // Émet un signal spécial pour que le client affiche la fenêtre
            socket.emit("double_dash_fenetre", { duree: stats.fenetreSec });
            cooldowns[socket.id]["attaque3"] = 0; // pas de cooldown tant que fenêtre ouverte
        }

        // Lance le dash animé
        effets[socket.id].dash = {
            actif:    true,
            dirX:     dx / dLen,
            dirY:     dy / dLen,
            vitesse:  stats.vitesseDash,
            finAt:    now2 + stats.dureeDash,
            cooldown: dansLaFenetre ? stats.cooldown : 0, // cooldown seulement au 2e
            estDoubleDashFinal: dansLaFenetre,
        };
        socket.emit("dash_debut", { couleur: stats.couleur });
        return; // attaque_ok géré par fin de dash

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
        effets[socket.id]      = { bouclier: { actif: false }, boost: { actif: false }, dash: { actif: false }, ralenti: { actif: false } };

        equipesEnAttente[equipe] = equipesEnAttente[equipe].filter(m => m.id !== socket.id);
        const membres = equipesEnAttente[equipe].map(m => ({ nom: m.nom || "Anonyme" }));
        equipesEnAttente[equipe].forEach(m => io.to(m.id).emit("membres_equipe", membres));

        console.log(`[Joueur connecté] ${nomJoueur} (${classe}, ${equipe}) — ID: ${socket.id}`);
        socket.emit("rejoindre_ok", { monId: socket.id, perso, attaques: ATTAQUES[classe] });
        // Envoie l'historique du chat au joueur qui rejoint
        if (historicChat.length > 0) {
            socket.emit("chat_historique", historicChat);
        }
        broadcastGameState();
    });

    // Chat : stocke et diffuse à tous
    socket.on("chat_message", ({ texte }) => {
        const joueur = joueurs[socket.id];
        if (!joueur) return;
        if (typeof texte !== "string") return;
        const textePropre = texte.trim().slice(0, 200);
        if (!textePropre) return;

        const couleur = joueur.equipe === "blue" ? "#4fc3f7" : "#ef5350";
        const msg = {
            nomJoueur: joueur.nomJoueur,
            equipe:    joueur.equipe,
            couleur,
            texte:     textePropre,
            timestamp: Date.now(),
        };
        historicChat.push(msg);
        if (historicChat.length > CHAT_HISTORIQUE_MAX) historicChat.shift();
        console.log(`[Chat] ${joueur.nomJoueur} (${joueur.equipe}) : ${textePropre}`);
        io.emit("chat_message", msg);
    });

    socket.on("keys_update", ({ keys }) => {
        if (keysPressed[socket.id] !== undefined) keysPressed[socket.id] = keys;
    });

    socket.on("demande_respawn", () => {
        const joueur = joueurs[socket.id];
        if (!joueur || !joueur.estMort) return;
        const stats = CLASSES[joueur.classe] || CLASSES.hero;
        joueur.pv      = stats.pv;
        joueur.estMort = false;
        const spawnPos = positionSpawnSure(joueur.equipe);
        joueur.x = spawnPos.x;
        joueur.y = spawnPos.y;
        socket.emit("respawn");
        broadcastGameState();
        console.log(`[Respawn] ${joueur.nomJoueur} réapparaît`);
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
        for (const [zid, zone] of Object.entries(zonesPersistantes)) { if (zone.lanceurId === socket.id) delete zonesPersistantes[zid]; }
        for (const [tid, tg] of Object.entries(telegraphesActifs)) { if (tg.socketId === socket.id) delete telegraphesActifs[tid]; }
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
# SAE402 - Jeu Pixel Art Multijoueur

## 🎮 Description

**SAE402** est un jeu pixel art **multijoueur en temps réel** développé en JavaScript et exécuté sur un serveur Node.js. Le projet utilise une architecture **client-serveur** avec **WebSockets** pour permettre à plusieurs joueurs de jouer ensemble ou contre dans un environnement partagé en ligne.

### Caractéristiques principales
- 🎮 **Gameplay multijoueur** : Jouez avec d'autres joueurs en temps réel
- 🎨 **Sprites personnalisés** : Tous les sprites visuels sont créés de manière artisanale
- 🗺️ **Cartes custom** : Les environnements de jeu sont conçus à la main
- 🔌 **WebSockets** : Communication bidirectionnelle instantanée entre serveur et clients
- ⚡ **Node.js** : Serveur performant pour gérer les connexions multiples
- 📱 **Cross-platform** : Jouable sur tous les navigateurs web modernes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Serveur Node.js                        │
│                    (serveur.js)                             │
│  • Gestion des connexions WebSocket                         │
│  • Synchronisation d'état du jeu                           │
│  • Logique serveur (validation, calculs)                   │
└─────────────────────────────────────────────────────────────┘
           ▲                    ▲                    ▲
       WebSocket            WebSocket            WebSocket
           │                    │                    │
    ┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐
    │  Client 1   │      │  Client 2   │      │  Client N   │
    │  (Joueur 1) │      │  (Joueur 2) │      │  (Joueur N) │
    │  HTML/CSS   │      │  HTML/CSS   │      │  HTML/CSS   │
    │  JS Client  │      │  JS Client  │      │  JS Client  │
    └─────────────┘      └─────────────┘      └─────────────┘
```

### Flux de communication
1. **Client** → **Serveur** : Entrées utilisateur (mouvement, action)
2. **Serveur** : Traitement de la logique de jeu
3. **Serveur** → **Tous les Clients** : Mise à jour d'état du jeu

## 📊 Composition du Projet

- **JavaScript** : 58.2% - Logique de jeu (serveur + client) et gestion WebSockets
- **CSS** : 28.7% - Stylisation et animations
- **HTML** : 13.1% - Structure et interface utilisateur

## 🛠️ Stack Technique

### Backend
- **Node.js** : Serveur JavaScript runtime
- **WebSocket** : Communication bidirectionnelle en temps réel
- **Gestion d'événements** : Synchronisation multi-clients

### Frontend
- **JavaScript ES6+** : Client-side game logic
- **HTML5 Canvas** : Rendu des graphiques
- **CSS3** : Animations et stylisation
- **WebSocket Client** : Communication avec le serveur

## 🎨 Ressources Créatives

Tous les éléments visuels du jeu sont créés de manière artisanale :
- **Sprites** : Conception pixel art custom
- **Tileset/Cartes** : Création manuelle des niveaux et environnements
- **Palette graphique** : Cohérence visuelle personnalisée

## 📋 Prérequis

- **Node.js** (v14.0.0 ou supérieur)
- **npm** (généralement inclus avec Node.js)
- Un navigateur web moderne (Chrome, Firefox, Safari, Edge)

## 🚀 Installation et Utilisation

### 1. Cloner le repository
```bash
git clone https://github.com/jeremyedu2005/SAE402.git
cd SAE402
```

### 2. Installer les dépendances (si nécessaire)
```bash
npm install
```

### 3. Lancer le serveur
```bash
node serveur.js
```

Le serveur démarre sur `http://localhost:3000` (ou le port configuré dans `serveur.js`)

### 4. Accéder au jeu
- Ouvrez votre navigateur et accédez à `http://localhost:3000`
- Ouvrez plusieurs onglets ou navigateurs pour tester le multijoueur
- Le serveur gère automatiquement la synchronisation entre tous les clients

## 📁 Structure du Projet

```
SAE402/
├── serveur.js              # Serveur Node.js principal
│                           # • Gestion WebSocket
│                           # • Logique de jeu serveur
│                           # • Synchronisation d'état
├── public/                 # Fichiers statiques (servis au client)
│   ├── index.html         # Page principale
│   ├── style.css          # Feuilles de styles
│   ├── client.js          # Logique client
│   ├── assets/            # Ressources graphiques
│   │   ├── sprites/       # Sprites personnalisés
│   │   ├── maps/          # Cartes du jeu
│   │   └── tiles/         # Tilesets
│   └── lib/               # Bibliothèques JavaScript
├── package.json           # Configuration npm et dépendances
└── README.md              # Documentation (ce fichier)
```

## 🎮 Fonctionnalités

### Gameplay
- ✅ Multijoueur en temps réel
- ✅ Synchronisation d'état en direct
- ✅ Gestion des collisions serveur
- ✅ Système de jeu complet (PvP ou coopératif)

### Architecture
- ✅ Validation côté serveur
- ✅ Communication WebSocket efficace
- ✅ Gestion des déconnexions
- ✅ Reconnexion automatique (si implémentée)

### Artistique
- ✅ Sprites pixel art personnalisés
- ✅ Cartes créées manuellement
- ✅ Ambiance visuelle cohérente

## 🔌 Communication WebSocket

### Événements côté Client

**Envoi au serveur :**
```javascript
// Exemple : Mouvement du joueur
socket.emit('playerMove', { x, y, direction });

// Exemple : Action de jeu
socket.emit('playerAction', { action: 'attack' });
```

**Réception du serveur :**
```javascript
// Mise à jour d'état
socket.on('gameState', (state) => {
  // Synchroniser l'état du jeu
});

// Mise à jour des autres joueurs
socket.on('otherPlayersUpdate', (players) => {
  // Afficher les autres joueurs
});
```

### Événements côté Serveur

```javascript
socket.on('playerMove', (data) => {
  // Valider et traiter le mouvement
  // Diffuser aux autres clients
  io.emit('gameState', updatedState);
});
```

## 👨‍💻 Auteur

- **Développeur** : [jeremyedu2005](https://github.com/jeremyedu2005)
- **Développeur** : [theotimeaudaire-coder](https://github.com/theotimeaudaire-coder)
- **Développeur** : [alnrfLO](https://github.com/alnrfLO)
- **Développeur** : [Eyam-ruel](https://github.com/Eyam-ruel)
- **Développeuse** : [S-Kaina](https://github.com/S-Kaina)
- **Développeur** : [butterfly-wing](https://github.com/butterfly-wing)
- **Type de projet** : SAE (Situation d'Apprentissage et d'Évaluation)
- **Dernière mise à jour** : 17 mars 2026

## 📄 Licence

Ce projet est sans licence spécifiée. Veuillez consulter le propriétaire du repository pour les conditions d'utilisation.

## 🤝 Contribution

Les contributions sont bienvenues ! Pour contribuer :

1. **Forkez** le repository
2. **Créez une branche** pour votre feature 
   ```bash
   git checkout -b feature/NouvelleFeature
   ```
3. **Committez** vos changements 
   ```bash
   git commit -m 'Add: Description de la nouvelle feature'
   ```
4. **Poussez** vers la branche 
   ```bash
   git push origin feature/NouvelleFeature
   ```
5. **Ouvrez une Pull Request**

### Contribution aux sprites/cartes
Si vous souhaitez contribuer aux ressources artistiques :
- Respectez le style pixel art existant
- Soumettez vos créations via une Pull Request
- Décrivez l'élément ajouté et son utilisation

## 🐛 Troubleshooting

### Le serveur ne démarre pas
```bash
# Vérifiez que Node.js est installé
node --version

# Vérifiez les permissions du fichier
chmod +x serveur.js

# Vérifiez les dépendances
npm install
```

### Problèmes de connexion WebSocket
- Vérifiez que le port est accessible
- Assurez-vous que le pare-feu n'interdit pas la connexion
- Consultez les logs du serveur pour les détails d'erreur

### Sync de jeu désynchronisée
- Rechargez la page du client
- Redémarrez le serveur
- Vérifiez la latence réseau

## 📚 Documentation Utile

- [Node.js Documentation](https://nodejs.org/docs/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Socket.IO Documentation](https://socket.io/docs/) (si utilisé)



## 🎯 Roadmap / Futures Améliorations

- [ ] Persistance des données (base de données)
- [ ] Système de progression/niveau
- [ ] Améliorations graphiques supplémentaires
- [ ] Optimisation des performances réseau
- [ ] Modes de jeu supplémentaires
- [ ] Système de chat intégré
- [ ] Matchmaking intelligent

---

**Profitez du jeu ! Amusez-vous en multijoueur ! 🎮✨**

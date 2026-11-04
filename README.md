# GéoTorche

Des fichiers cachés dans le monde réel. Un fichier (photo, PDF, message…) est chiffré sur le téléphone et ne s'ouvre qu'au bon endroit, révélé par une « torche » (la caméra), avec le mot de passe.

## Fonctionnement

1. **Cacher** : choisir le fichier, mesurer sa position (ou coller des coordonnées), photographier l'objet, choisir un mot de passe.
2. **Partager** : envoyer la cachette (fichier `.gtch`) et donner le mot de passe à part.
3. **Retrouver** : importer la cachette, suivre la flèche jusqu'à la zone, balayer avec la torche. L'icône apparaît sur l'objet ; on la touche et on entre le mot de passe.

## Les serrures

- **Lieu (GPS)** : porte d'entrée de l'application (une fausse position peut la tromper).
- **Torche** : direction (boussole) et reconnaissance de la photo de l'objet.
- **Mot de passe** : chiffrement réel AES-256-GCM, clé dérivée par PBKDF2-SHA256 (600 000 itérations).
- **Étiquette QR** (option) : secret imprimé collé sur l'objet, nécessaire pour ouvrir.
- **Lieu secret** (option) : l'endroit exact, à 20 m près, entre dans la clé ; seule une zone approximative est donnée.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | L'application complète, en un seul fichier (fonctionne hors connexion) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installation sur l'écran d'accueil et mode hors connexion |
| `src/` | Sources : `app.js`, `body.html`, `style.css` |
| `build.py` | Assemble `src/` en `index.html` |
| `tests/` | Tests automatiques (Playwright) : unitaires, parcours complet, calibration visuelle |

## Mise en ligne

Caméra, GPS et boussole exigent une adresse sécurisée (https). Déposer `index.html`, `manifest.webmanifest`, `sw.js` et les icônes sur un hébergement statique (Netlify Drop, par exemple), ouvrir l'adresse dans Chrome, puis « Ajouter à l'écran d'accueil ».

## Bibliothèques incluses

- jsQR 1.4.0 (licence Apache 2.0), lecture des codes QR
- qrcode-generator 2.0.4 (licence MIT, Kazuhiko Arase), création des étiquettes QR

## Droits

© 2026 Mr-Akmos-Lab. Tous droits réservés. Aucune licence d'utilisation, de copie ou de modification n'est accordée sans autorisation écrite.

# Analyseur Code G

Application web pour analyser et optimiser des programmes de code G (CNC) en format `.txt`, `.nc` ou `.gcode`.
Tout se passe dans le navigateur : le fichier n'est jamais envoyé sur un serveur.

## Ce que fait l'application

| Fonction | Détail |
|---|---|
| Lecture du programme | Coloration syntaxique (G, M, axes, F/S, T), numéros de ligne, liste virtualisée (programmes de 100 000 lignes et plus) |
| Trajectoire d'outil | Vues XY, XZ et iso ; coupe, rapides et palpage en couleurs différentes ; zoom à la molette, déplacement à la souris, double-clic pour recadrer |
| Synchronisation | Toucher une ligne surligne le segment, toucher un segment sélectionne la ligne |
| Simulation | Curseur pour rejouer le programme ligne par ligne |
| Alertes | Codes inconnus du contrôleur, dépassement de course, plongée G0 sous Z0, rapide XY dans la matière, avance absente ou héritée, arcs invalides, fin de programme absente |
| Temps par catégorie | Coupe, déplacement rapide, changement d'outil, démarrage broche, arrêts et temporisations, palpage |
| Temps par outil et par type d'outil | Fraise, foret, palpeur, taraud, graveur, fraise boule, surfaceuse (détectés depuis les commentaires) |
| Temps et outils par face | Faces lues dans les commentaires `(FACE A …)`, `(CÔTÉ …)`, `(PHASE …)`, sinon par origine pièce G54 à G59 ou indexation A/B |
| Optimisation | Questionnaire (machine, broche max, matière, outils, arrosage, priorité, série) et suggestions en format question/réponse, avec gain estimé et lignes concernées |
| Exports | CSV des outils (base de données), CSV des faces, rapport HTML imprimable en PDF |

Contrôleurs pris en charge : **GRBL**, **Fanuc**, **LinuxCNC** (codes reconnus et unité de `G4 P`).
Cycles de perçage `G73`, `G81` à `G89` simulés (rapide à R, avance à Z, retour G98/G99).
Fichiers en pouces (`G20`) convertis en mm.

## Utilisation hors ligne (programmes confidentiels)

Le site ne transmet jamais les programmes : ils sont lus dans le navigateur. Pour travailler sans aucune connexion :

1. Sur le site, cliquer sur **Télécharger la version hors ligne** (bas de page).
2. Enregistrer `analyseur-code-g-hors-ligne.html` sur l'ordinateur.
3. L'ouvrir d'un double-clic, même sans Internet. Le fichier contient toute l'application et n'utilise aucune ressource externe.

Pour une nouvelle version, télécharger de nouveau le fichier. `npm run build` le produit aussi dans `dist/`.

## Installation

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement à chaud |
| `npm test` | Tests unitaires du cœur d'analyse (Vitest) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` | Version de production dans `dist/` |
| `npm run preview` | Aperçu local de `dist/` |

## Déploiement gratuit sur GitHub Pages

1. Créer un dépôt sur GitHub et y pousser ce projet :
   ```bash
   git init
   git add .
   git commit -m "Analyseur Code G"
   git branch -M main
   git remote add origin https://github.com/<compte>/analyseur-code-g.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` teste, compile et publie à chaque push sur `main`.
   Le site est ensuite disponible à `https://<compte>.github.io/analyseur-code-g/`.

## Structure

```
├── samples/                     Programmes d'exemple (.txt)
├── src/
│   ├── core/                    Analyse en TypeScript pur, sans React
│   │   ├── types.ts             Types partagés
│   │   ├── settings.ts          Réglages par défaut, catégories, codes G/M par contrôleur
│   │   ├── tooling.ts           Type, diamètre et dents d'un outil depuis son commentaire
│   │   ├── parser.ts            Lecture du code G : mouvements, temps, outils, faces, alertes
│   │   ├── optimizer.ts         Matières, questionnaire, suggestions d'optimisation
│   │   ├── export.ts            CSV et rapport HTML
│   │   ├── format.ts            Formats de temps et de nombres (fr-CA)
│   │   └── __tests__/           Tests Vitest
│   ├── components/              Panneaux de l'interface
│   ├── hooks/                   Stockage local et téléchargement
│   ├── App.tsx                  Assemblage de la page
│   └── styles.css               Thème clair/sombre, mise en page
├── CLAUDE.md                    Guide pour continuer le développement avec Claude Code
└── .github/workflows/deploy.yml Tests + déploiement GitHub Pages
```

## Bien écrire ses commentaires pour une meilleure analyse

```gcode
(T1 FRAISE 6 MM 2 DENTS CARBURE - EBAUCHE)
(T3 FORET 8 MM HSS)
(T99 PALPEUR 3D)
(FACE A - DESSUS)
...
M0 (RETOURNER LA PIECE)
(FACE B - DESSOUS)
```

- Le **type** d'outil vient des mots FRAISE, FORET, PALPEUR, TARAUD, GRAVEUR, BOULE…
- Le **diamètre** (`6 MM`, `1/4"`) et le nombre de **dents** (`2 DENTS`, `3FL`) servent au calcul de la vitesse de coupe et de l'avance par dent.
- `HSS` ou `CARBURE` dans la description remplace la réponse du questionnaire pour cet outil.

## Limites connues

- Les temps ne tiennent pas compte des accélérations de la machine : sur des trajectoires faites de très petits segments, le temps réel peut être nettement plus long.
- Seuls les arcs dans le plan XY (`G17`) sont tracés en arc ; en `G18`/`G19`, ils sont tracés en ligne droite.
- Les cycles de perçage sont simplifiés : les débourrages de `G83`/`G73` et le retour en avance du taraudage ne sont pas comptés.
- `G28`, `G92`, la compensation de rayon `G41`/`G42` et les macros (`G65`, variables `#`) ne sont pas interprétés.
- Les plages de coupe par matière sont des valeurs de départ prudentes : toujours valider avec les données du fabricant d'outils.

## Licence

MIT, voir [LICENSE](LICENSE).

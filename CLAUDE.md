# CLAUDE.md

Guide pour travailler sur ce projet avec Claude Code.

## Le projet

Application web (React 18 + Vite + TypeScript) qui analyse des programmes de code G CNC dans le navigateur :
temps par catégorie, par outil, par type d'outil et par face ; alertes ; suggestions d'optimisation en format question/réponse ;
exports CSV et rapport HTML. Aucune donnée ne quitte le navigateur. Interface et messages **en français (Québec, fr-CA)**.

## Commandes

```bash
npm install
npm run dev         # développement
npm test            # tests Vitest du cœur (à lancer après chaque modification de src/core)
npm run typecheck   # TypeScript strict
npm run build       # production dans dist/
```

## Architecture

- `src/core/` : **logique pure**, sans React ni DOM. Toute nouvelle règle d'analyse ou d'optimisation va ici, avec un test.
  - `parser.ts` → `parseGCode(text, settings): ParseResult`. Fonction pure. Unités internes : **mm** et **minutes**.
    Chaque temps passe par `charge(categorie, minutes, distance)`, qui l'impute à la fois à la catégorie, à l'outil courant et à la face courante.
    Invariant testé : somme des catégories = somme par outil (+ « Sans outil ») = somme par face.
  - `optimizer.ts` → `optimize(result, answers, settings): Suggestion[]`. Chaque suggestion a une `question`, une `answer`, un `gain` (minutes)
    et des `lines`. `seriesOnly: true` = gain par pièce sur une série, exclu de `totalGain`.
  - `settings.ts` : codes G/M reconnus par contrôleur (`KNOWN_G`, `KNOWN_M`), catégories de temps et couleurs.
  - `tooling.ts` : type/diamètre/dents d'outil lus dans le commentaire `(T1 FRAISE 6 MM 2 DENTS)`.
  - `export.ts` : CSV (séparateur `;`, BOM UTF-8 pour Excel français) et rapport HTML autonome.
- `src/components/` : un composant par panneau. Ils reçoivent `ParseResult` et n'en recalculent rien.
- `src/App.tsx` : état global (fichier, réglages, réponses du questionnaire, sélection, face filtrée) ; réglages et réponses persistés dans `localStorage`.

## Conventions

- TypeScript strict, pas de `any`.
- Textes visibles en français, phrases courtes, voix active. Nombres formatés avec `formatNumber` / `formatTime` (fr-CA).
- Couleurs uniquement via les variables CSS de `styles.css` (thèmes clair et sombre). Les couleurs de catégories sont dans `CATEGORIES`.
- Une suggestion d'optimisation = une question que l'usineur se poserait, une réponse concrète (valeur proposée), un gain chiffré si possible.
- Ne jamais présenter une valeur de coupe comme certaine : ce sont des points de départ (voir `MATERIALS`).
- Ajouter un exemple dans `samples/` quand une nouvelle syntaxe est prise en charge, et un test qui l'utilise.

## Prochaines étapes possibles

1. **Accélérations machine** : réglages `$120`–`$122` (GRBL) pour un temps estimé réaliste sur les petits segments.
2. **Programme optimisé** : générer un nouveau `.txt` qui applique les suggestions acceptées (dégagements, approches G0, F/S), avec comparatif avant/après.
3. **Bibliothèque d'outils** : corriger le type, le diamètre et le matériau d'un outil à la main, mémorisé par numéro d'outil.
4. **Web Worker** pour analyser les très gros fichiers sans bloquer l'interface.
5. **Historique** : comparer plusieurs programmes ou versions d'un même programme (IndexedDB).
6. Plans `G18`/`G19`, `G28`, `G92`, compensation `G41`/`G42`, débourrages `G83`.
7. Questions supplémentaires : mode de bridage et hauteur des brides, longueur de sortie d'outil, tolérance et fini visés, surépaisseur d'ébauche, logiciel FAO et post-processeur.

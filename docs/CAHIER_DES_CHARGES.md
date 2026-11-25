# UnIntelliJ — Cahier des charges

> Statut : **brouillon v0.1 — à valider** · 2026-11-25

## 1. Objectif

Faire en sorte que **VS Code ressemble et se comporte comme IntelliJ IDEA (New UI « Islands »)**, au point de pouvoir y travailler au quotidien sans perdre ses réflexes JetBrains.

Contexte d'usage :

- **Poste de travail sous Windows**, IDE JetBrains interdit → VS Code imposé.
- Usage immédiat : **Angular** (TS / HTML / SCSS) + **édition de code Java** (Maven, Spring Boot, JUnit).
- L'exécution/debug Java depuis VS Code viendra **plus tard** (aujourd'hui fait dans Eclipse).
- Usage secondaire sur Mac (perso).

Principe directeur : **« si on peut le choisir dans IntelliJ, on peut le choisir dans UnIntelliJ »**.

## 2. Contraintes

| Contrainte | Conséquence |
|---|---|
| Politique d'installation d'extensions au travail inconnue | **Aucune dépendance obligatoire** vers une autre extension. Les intégrations (Java Red Hat, Debugger Java, Angular Language Service…) sont **détectées à l'exécution** et utilisées si présentes ; sinon dégradation propre. Distribution possible en `.vsix` local. |
| Windows en priorité, macOS ensuite | Keymap et chemins testés sur les deux OS. |
| Perso d'abord, publication Marketplace ensuite | Code et config propres dès le départ, licences des assets vérifiées (cf. §10). |
| API officielle de VS Code limitée sur la forme de l'UI | Deux niveaux : **mode standard** (API officielle uniquement) et **mode Islands+** optionnel, désactivé par défaut (injection CSS/JS, cf. §4.3). |

## 3. Périmètre

### Dans le périmètre (v1)

1. Apparence : thèmes, icônes, réglages d'éditeur, mode Islands+ optionnel
2. Keymap IntelliJ par défaut (Windows et macOS selon l'OS)
3. Search Everywhere (double Shift) complet + popups de navigation
4. Tool windows : Project, Structure, Terminal, Problems, npm (Angular), Run widget pour scripts npm
5. Git : Commit tool window, popup des branches, Git Log avec graphe, diff/merge
6. Fenêtre **Settings** façon IntelliJ (`Ctrl+Alt+S`)

### Reporté (v2+)

- Run configurations Java / Spring Boot / JUnit, Services tool window, debugger Java
- Maven tool window
- Database tool window
- Refactorings avancés au‑delà de ce que fournissent les language servers

### Hors périmètre

- Réimplémenter un language server Java (on s'appuie sur jdtls / Red Hat si installé)
- Copier du code ou des assets propriétaires JetBrains

## 4. Apparence

### 4.1 Thèmes de couleurs

- **Islands Dark** et **Islands Light** : workbench + coloration syntaxique fidèle aux schémas par défaut d'IntelliJ pour TS, HTML, SCSS, Java, JSON, YAML, XML, Markdown (y compris semantic tokens).
- Réglage **Theme** dans Settings › Appearance : `Islands Dark` / `Islands Light` / **Sync with OS** (+ choix du thème clair et du thème sombre utilisés en synchro, comme IntelliJ).
  Implémentation : `workbench.colorTheme`, `window.autoDetectColorScheme`, `workbench.preferred{Dark,Light}ColorTheme`.

### 4.2 Icônes et polices

- **File icon theme** reprenant les icônes New UI (fichiers, dossiers, dossiers spéciaux `src`, `test`, `resources`, modules…).
- **Product icon theme** (icônes de l'interface : activity bar, actions, debug…) style New UI.
- Police éditeur : **JetBrains Mono** (OFL) proposée, taille/interligne réglables.
- Préréglages VS Code « à la IntelliJ » appliqués à la demande (bouton dans Settings, réversible) : minimap off, breadcrumbs, onglets, comportement du explorer, etc.

### 4.3 Mode Islands+ (optionnel, désactivé par défaut)

Ce que l'API officielle **ne permet pas** et qui nécessite une injection CSS/JS dans le workbench :

- panneaux arrondis et espacés (« îles »), fond de fenêtre distinct ;
- barre du haut façon IntelliJ : widgets **Projet**, **Branche**, **Run** dans la title bar ;
- police d'interface (Inter), hauteur des onglets et des lignes d'arbre, espacements.

Exigences :

- activation/désactivation depuis Settings › Appearance, avec avertissement clair ;
- **sauvegarde et restauration** des fichiers originaux ;
- réapplication automatique après mise à jour de VS Code (détection au démarrage) ;
- suppression du bandeau « installation corrompue » ;
- gestion du cas où l'installation n'est pas inscriptible (install système Windows → message explicite, pas de crash).

> Poste de travail : VS Code **1.140.0 « system setup »** (installé dans `Program Files`) → Islands+ nécessite des droits administrateur. Sans eux, le mode reste indisponible au travail (fonctionne sur Mac / install « user setup »).

Sans Islands+, les widgets Projet / Branche / Run sont proposés en **status bar** + commandes.

## 5. Keymap

- **Keymap selon l'OS** : *IntelliJ Windows default* sous Windows, *macOS default* sous Mac. Sélecteur dans Settings › Keymap (`Auto` / `Windows` / `macOS`).
- Settings › Keymap affiche la liste des raccourcis avec recherche (par nom ou par touche), comme IntelliJ ; possibilité de désactiver un raccourci individuellement.
- Gestion des conflits avec les raccourcis VS Code par défaut (les nôtres gagnent quand le keymap est actif).

Raccourcis prioritaires (Windows / macOS) — liste non exhaustive, la liste complète sera dans `docs/KEYMAP.md` :

| Action | Windows | macOS |
|---|---|---|
| Search Everywhere | `Shift Shift` | `⇧⇧` |
| Find Action | `Ctrl+Shift+A` | `⌘⇧A` |
| Go to Class / File / Symbol | `Ctrl+N` / `Ctrl+Shift+N` / `Ctrl+Alt+Shift+N` | `⌘O` / `⌘⇧O` / `⌘⌥O` |
| Recent Files / Recent Locations | `Ctrl+E` / `Ctrl+Shift+E` | `⌘E` / `⌘⇧E` |
| Switcher | `Ctrl+Tab` | `⌃Tab` |
| File Structure popup | `Ctrl+F12` | `⌘F12` |
| Go to Declaration / Implementation | `Ctrl+B` / `Ctrl+Alt+B` | `⌘B` / `⌘⌥B` |
| Find Usages / Show Usages | `Alt+F7` / `Ctrl+Alt+F7` | `⌥F7` / `⌘⌥F7` |
| Find in Files / Replace in Files | `Ctrl+Shift+F` / `Ctrl+Shift+R` | `⌘⇧F` / `⌘⇧R` |
| Back / Forward | `Ctrl+Alt+←/→` | `⌘[` / `⌘]` |
| Show Context Actions | `Alt+Enter` | `⌥↩` |
| Rename | `Shift+F6` | `⇧F6` |
| Reformat / Optimize Imports | `Ctrl+Alt+L` / `Ctrl+Alt+O` | `⌘⌥L` / `⌃⌥O` |
| Extend / Shrink Selection | `Ctrl+W` / `Ctrl+Shift+W` | `⌥↑` / `⌥↓` |
| Duplicate / Delete Line | `Ctrl+D` / `Ctrl+Y` | `⌘D` / `⌘⌫` |
| Move Line / Statement | `Alt+Shift+↑/↓` / `Ctrl+Shift+↑/↓` | `⌥⇧↑/↓` / `⌘⇧↑/↓` |
| Comment line / block | `Ctrl+/` / `Ctrl+Shift+/` | `⌘/` / `⌘⌥/` |
| Tool windows Project / Commit / Git / Terminal | `Alt+1` / `Alt+0` / `Alt+9` / `Alt+F12` | `⌘1` / `⌘0` / `⌘9` / `⌥F12` |
| Hide tool window / back to editor | `Shift+Esc` / `Esc` | `⇧⎋` / `⎋` |
| Commit / Push / Update Project | `Ctrl+K` / `Ctrl+Shift+K` / `Ctrl+T` | `⌘K` / `⌘⇧K` / `⌘T` |
| Rollback / VCS popup | `Ctrl+Alt+Z` / `Alt+\`` | `⌘⌥Z` / `⌃V` |
| Settings | `Ctrl+Alt+S` | `⌘,` |

## 6. Navigation et recherche

### 6.1 Search Everywhere (`Shift Shift`) — fonctionnalité n°1

Popup unique avec onglets **All · Classes · Files · Symbols · Actions · Text**, navigation entre onglets par `Tab` / `Shift+Tab`, raccourcis d'onglet (`Ctrl+N` dans le popup bascule sur Classes, etc.).

| Onglet | Source |
|---|---|
| Classes | symboles de workspace filtrés (classes, interfaces, enums, composants/services Angular) — TS natif, Java si jdtls présent |
| Files | index de fichiers du workspace (cache + watcher), matching type IntelliJ (CamelHumps, `chemin/partiel`, `:ligne`) |
| Symbols | tous les symboles de workspace |
| Actions | toutes les commandes VS Code + nos actions + **réglages booléens basculables** (comme IntelliJ), avec raccourci affiché |
| Text | recherche plein texte via le ripgrep embarqué dans VS Code, aperçu de la ligne |
| All | mélange classé : Recent files en tête, puis Classes, Files, Symbols, Actions |

Exigences : options par onglet (inclure non‑project items / bibliothèques, filtres par type de fichier), historique des recherches, `Ctrl+Enter`/`Shift+Enter` pour ouvrir à côté, latence perçue < 100 ms sur un projet Angular moyen (résultats progressifs).

### 6.2 Autres popups

- **Recent Files** (`Ctrl+E`) avec la colonne des tool windows à gauche et filtre « Show edited only ».
- **Recent Locations** (`Ctrl+Shift+E`) avec extrait de code.
- **Switcher** (`Ctrl+Tab`).
- **File Structure** (`Ctrl+F12`) avec filtrage au clavier.
- **Show Usages** popup (`Ctrl+Alt+F7`).
- **Find (`Ctrl+F`)** : widget natif de VS Code conservé, restylé façon IntelliJ (couleurs via le thème ; forme/position via Islands+).
- **Find in Files (`Ctrl+Shift+F`)** : pas de popup dédié (l'onglet *Text* de Search Everywhere couvre le besoin) ; le raccourci ouvre la vue Search native, stylée.

## 7. Tool windows

| Tool window | v1 | Notes |
|---|---|---|
| Project | oui | Explorer natif conservé (drag&drop, rename inline), configuré et iconographié façon IntelliJ ; sélecteur de vue « Project / Project Files / Open Files » si faisable |
| Structure | oui | Vue dédiée (symboles du document) avec tri alpha, filtres (champs, méthodes héritées…), « Autoscroll from source » |
| Terminal / Problems | oui | Natifs, repositionnés et stylés |
| npm | oui | Liste des scripts de `package.json`, double‑clic pour lancer (Angular : `start`, `build`, `test`…) |
| Run widget | oui (npm) | Sélecteur de configuration + Run/Debug/Stop ; configurations npm et Angular `ng serve` en v1, Java en v2 |
| Run / Debug | natifs | Stylés ; configs Java reportées |
| Services, Maven, Database | v2+ | — |

Disposition par défaut proche d'IntelliJ : Project à gauche, Commit à gauche (onglet séparé), Structure en bas à gauche ou à droite, Terminal/Problems/Git en bas.

## 8. Git (sur l'API de l'extension Git intégrée de VS Code)

- **Commit tool window** (`Alt+0`) : arbre des modifications avec cases à cocher, **changelists** (créer, déplacer, changelist active), unversioned files, message de commit avec historique, **Amend**, Commit / Commit and Push, Rollback, Shelve (v1.1).
- **Popup des branches** (title bar en Islands+, status bar sinon) : Recent, Local, Remote, recherche, actions New Branch / Checkout / Update / Push / Merge / Rebase / Compare / Delete.
- **Git tool window** (`Alt+9`) : Log avec graphe coloré, filtres (branche, auteur, date, chemin), détail du commit (fichiers modifiés, diff), actions contextuelles (cherry-pick, revert, reset, checkout, new branch).
- **Diff** : visionneuse native de VS Code (side‑by‑side) aux couleurs IntelliJ, navigation `F7`/`Shift+F7` entre les changements.
- **Merge** : éditeur de merge 3 panneaux natif, stylé et doté des actions IntelliJ (Accept Left/Right, Apply non‑conflicting changes) ; dialog « Conflicts » listant les fichiers.
- **Update Project** (`Ctrl+T`) : fetch + merge/rebase selon le réglage.
- Annotate (blame) dans la gouttière.

## 9. Fenêtre Settings (`Ctrl+Alt+S`)

Panneau webview avec arbre à gauche, recherche en haut, boutons OK / Cancel / Apply :

- **Appearance & Behavior** › Appearance (thème, sync OS, Islands+, polices UI) · System Settings
- **Keymap** (cf. §5)
- **Editor** › Font, Color Scheme, General (comportements mappés vers les réglages VS Code)
- **Version Control** › Git (update method merge/rebase, changelists on/off…), Commit
- **Tools** › Search Everywhere (sources, exclusions)
- **Plugins** : état des intégrations détectées (Java, Angular…) avec lien d'installation

Chaque option est stockée dans les réglages VS Code (`unintellij.*`) pour rester synchronisable via Settings Sync.

## 10. Exigences techniques

- **TypeScript**, bundle **esbuild**, VS Code ≥ 1.100 (cible de test : **1.140** du poste de travail), Node fourni par VS Code.
- Webviews (Settings, Commit, Git Log, popups riches) : UI légère (Preact) + design tokens partagés avec les thèmes.
- Tests : unitaires (Vitest) pour la logique pure (matching, keymap, parsing git) ; intégration via `@vscode/test-electron` ; CI GitHub Actions Windows + macOS.
- Performance : activation < 200 ms, aucune tâche lourde au démarrage (index de fichiers paresseux).
- Licences : icônes New UI issues d'`intellij-community` (**Apache 2.0**, attribution dans `NOTICE`), JetBrains Mono (**OFL**). Aucun asset propriétaire.
- **Nom** : « IntelliJ » est une marque JetBrains ; avant publication sur le Marketplace il faudra probablement un nom/display name qui ne la contienne pas (le nom de dépôt peut rester).

## 11. Découpage en lots (commits)

Tout est livré ensemble, mais construit par lots indépendants et testables :

1. Socle : scaffold, build, CI, structure des réglages
2. Thèmes Islands Dark / Light + sync OS
3. Icônes (file + product)
4. Keymap Windows / macOS
5. Search Everywhere + popups de navigation
6. Fenêtre Settings
7. Structure + npm + Run widget
8. Git : popup des branches, Commit tool window, changelists
9. Git Log + diff/merge
10. Mode Islands+
11. Documentation, packaging `.vsix`

## 12. Points ouverts

- [x] Find in Files : pas de popup dédié, Search Everywhere › Text + vue native stylée
- [x] Version de VS Code au travail : 1.140.0 (Windows 11, system setup)
- [ ] Droits admin au travail, ou passage à la « user setup » autorisé ? (conditionne Islands+)
- [ ] Extensions effectivement autorisées au travail
- [ ] Nom public pour le Marketplace (plus tard)

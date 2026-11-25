# UnIntelliJ — Cahier des charges

> Statut : **v1 implémentée (0.1.0)** · 2026-11-25 — écarts en §13, points à revoir dans `docs/SUIVI.md`

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

## 13. Écarts par rapport au cahier des charges (v0.1.0)

| Prévu | Réalisé | Raison |
|---|---|---|
| Webviews en Preact | DOM natif typé, sans framework | Interfaces simples ; bundle plus léger (~10 Ko par webview) |
| Popup Find in Files à confirmer | Pas de popup : Search Everywhere › Text + vue Search native | Décidé ensemble (§6.2) |
| Widgets Projet / Branche / Run dans la barre de titre | Barre d'état ; barre de titre avec Islands+ | Barre de titre non extensible par l'API |
| Onglets de Search Everywhere | Affichés dans le titre du popup, `Tab` pour changer | Pas d'API d'onglets dans les popups |
| Options de Structure en boutons bascule | Menu « … » de la vue avec ✓ | Pas de boutons bascule pour les extensions |
| Shelve (v1.1) | Stash via VCS Operations | Équivalent Git le plus proche |
| Keymap : réassigner un raccourci | Activer / désactiver par action | Écrire dans `keybindings.json` de l'utilisateur reste à décider |

## 14. Itération 2 — retours après installation au travail (2026-11-25)

Contexte : 0.2.0 installée sur le poste Windows (VS Code 1.140 « system setup » → **pas d'Islands+ possible**). Double Shift et Commit tool window validés. Tout ce qui suit doit d'abord fonctionner **sans injection CSS** ; Islands+ ne sert qu'à placer les éléments exactement comme dans IntelliJ quand il est disponible.

### 14.1 Typographie et lisibilité (priorité 1)

Constat : caractères trop petits, peu lisibles, « ne ressemble pas à IntelliJ ».

- Éditeur : JetBrains Mono (à installer « pour moi » sous Windows, sans admin), taille et interligne calibrés sur IntelliJ Windows (13 pt à 100 % d'échelle → environ 14-15 px dans VS Code selon la mise à l'échelle Windows), `editor.fontWeight`, ligatures off par défaut. Détecter si JetBrains Mono est absente et le signaler avec un lien.
- Interface : la police de l'interface n'est pas modifiable sans injection ; levier disponible = **zoom de la fenêtre** (`window.zoomLevel`, déjà dans Settings › Appearance) + tailles des arbres (`workbench.tree.indent`, `workbench.list.*`) → proposer un réglage « Taille de l'interface » façon IntelliJ (Appearance › Use custom font size).
- Calibrage sur captures côte à côte IntelliJ / VS Code **sur le poste Windows** (même fichier, même zoom).

### 14.2 Couleurs exactes (priorité 1)

Constat : « pas exactement les bonnes couleurs ».

- Remplacer les couleurs approximatives par les **valeurs officielles** d'intellij-community (licence Apache 2.0) : thèmes `expUI` / Islands (`*.theme.json`) pour l'interface, schémas d'éditeur (`*.xml`, Dark / Light New UI) pour la coloration syntaxique — import automatisé par un script comme pour les icônes.
- Vérification par captures avant/après, Islands Dark et Light.

### 14.3 Cases à cocher et contrôles des webviews (priorité 2) — **sans injection**

- Commit tool window et Settings : cases à cocher, boutons, champs, listes déroulantes restylés comme IntelliJ New UI (case arrondie 14 px, bleu accent cochée, état indéterminé, focus). Tout est dans nos webviews : CSS normale, aucune injection.

### 14.4 Widget de branche et synchronisation (priorité 1) — **indispensable**

Comportement IntelliJ à reproduire : nom de la branche avec **flèche verte ↗ + nombre** (commits locaux à pousser) et **flèche bleue ↙ + nombre** (commits distants pas encore récupérés), boutons **Update (pull) / Push / Fetch**, clic sur le nom → popup des branches.

- Sans Islands+ : **barre d'état en bas à gauche**, éléments séparés pour pouvoir colorer chaque flèche (vert / bleu) ; boutons Fetch / Update / Push en icônes ; fetch périodique en arrière-plan pour connaître les commits entrants (réglage d'intervalle).
- Mêmes actions en icônes dans la barre de titre des vues Commit et Git (natif, sans injection).
- Avec Islands+ : déplacés **dans la barre de titre à gauche**, exactement comme IntelliJ.
- Masquer/remplacer le widget de branche natif de VS Code pour éviter le doublon (à investiguer, sinon documenter le clic droit › masquer).

### 14.5 Configurations d'exécution unifiées (priorité 1)

Constat : « npm » (UnIntelliJ) et « Exécuter et déboguer » (VS Code natif) sont séparés ; IntelliJ regroupe tout (npm, Java, scripts SQL…) dans **un seul sélecteur en haut à droite** : flèche, nom de la configuration, Run / Debug / Stop, et menu « Edit Configurations… ».

- Un seul widget « Run configurations » listant npm, `launch.json` (et plus tard Java / Spring Boot / JUnit / SQL) ; menu déroulant groupé par type + « Edit Configurations… ».
- **Fenêtre Edit Configurations** façon IntelliJ (webview) : arbre des configurations par type à gauche, formulaire à droite (script, dossier, arguments, variables d'environnement…), ajout / copie / suppression.
- Emplacement : Islands+ → **en haut à droite** ; sinon **barre d'état en bas à gauche** (déjà présent mais peu visible : à rendre plus visible, icône + nom + chevron + ▶ 🐞 ■).
- Supprimer la tool window « npm » séparée de la barre d'activité (les scripts restent dans le widget et la fenêtre Edit Configurations).

### 14.6 Disposition des tool windows (priorité 2)

Disposition IntelliJ de Tom : **en haut à gauche** Project puis Commit, et rien d'autre ; **en bas à gauche** les exécutions (Run, sorties des configurations, Terminal…).

- Contrainte VS Code : une seule barre d'activité verticale ; le bas de cette barre est réservé à Comptes / Paramètres → **impossible d'y ajouter des icônes sans injection**.
- Sans injection :
  - Panneau du bas aligné à gauche (`workbench.panel.alignment: left`) pour qu'il occupe tout le bas, sous l'arbre du projet = équivalent « en bas à gauche » : Terminal, Run (sortie des configurations), Git, Problems.
  - Sortie des configurations dans un onglet « Run » dédié du panneau (une sous-vue par exécution, comme IntelliJ).
  - Barre d'activité réduite à Project et Commit : déplacer Structure dans le panneau ou la barre latérale secondaire, supprimer npm (cf. 14.5), et masquer les entrées natives (Recherche, Exécuter et déboguer, Extensions…) — par programme si VS Code le permet, sinon via un assistant « Disposition IntelliJ » qui guide le clic droit › masquer.
- Avec Islands+ : vraie colonne d'icônes en bas à gauche pour les tool windows du bas.

### 14.7 Questions encore ouvertes

- [x] Structure : **pas utilisée** → retirée de la barre d'activité (le popup File Structure `Ctrl+F12` reste).
- [ ] Faut-il garder une entrée de menu pour Recherche / Extensions une fois masquées (ex. dans Search Everywhere › Actions) ?
- [x] Captures de référence reçues (IntelliJ et VS Code sur le poste de travail). Elles contiennent des informations internes : **jamais versionnées**, constats résumés en §15.

## 15. Itération 2 — précisions après comparaison avec IntelliJ (2026-11-25)

Constats sur la capture d'IntelliJ au travail (non versionnée : informations internes) :

- Thème **Islands Light** (pas Dark) → calibrer d'abord **Islands Light** ; le thème par défaut doit suivre celui que Tom utilise.
- Police d'interface Inter ~13 px, éditeur JetBrains Mono : nettement plus grands et nets que dans VS Code (Segoe UI / Consolas petits).
- Barre de titre : logo, menu hamburger, **widget projet** (carré coloré avec l'initiale du projet + nom + ▾), **widget branche** (icône + nom ▾), à droite **widget Run** (icône + nom de la configuration ▾, ▶ vert, 🐞, ⋮), puis assistant IA, loupe (Search Everywhere), engrenage (Settings).
- Barre de gauche — haut : **Project**, **Commit**, `…` ; bas : **Services/Run**, **Terminal**, **Problems**, **Git**. Barre de droite : Notifications, Database, Maven.
- Barre d'état : **barre de navigation** (fil d'Ariane `module › src › main › … › fichier`) en bas à gauche ; à droite position `ligne:colonne`, fins de ligne, encodage, indentation, verrou lecture seule.
- Éditeur : widget d'inspection en haut à droite (nombre d'avertissements / validations, flèches haut/bas).

### 15.1 Vue Project avec sélecteur de vue (priorité 1)

Le titre de la tool window est un menu **« Project ▾ »** qui change la façon de voir le projet, comme IntelliJ :

- **Project** : arbre par module, chemin du module en gris à côté du nom, icônes de module, dossiers sources / ressources / tests / exclus colorés.
- **Packages** (Java) : arborescence par packages (via jdtls si présent, sinon analyse de `src/main/java`).
- **Project Files** : arbre brut des fichiers.
- **Open Files** et **Changed Files**.
- Implémentation : vue arbre UnIntelliJ « Project » qui remplace l'Explorateur de VS Code (même logique que Commit / Source Control : l'Explorateur natif est masqué). À conserver : renommer, créer, supprimer, glisser-déposer, copier les chemins, « Select Opened File », double-clic pour ouvrir.

### 15.2 Barre de gauche exactement comme IntelliJ (priorité 1)

- En haut : **Project** (icône dossier), puis **Commit** (icône « trait avec un rond »).
- **Git** (icône branche Git d'IntelliJ, onglet séparé) : log des branches, recherche de commit, graphe, détail du commit au clic, affiché **en bas** comme dans IntelliJ. Si VS Code ne permet pas d'icône en bas à gauche sans injection, l'icône Git va **sous Commit en haut à gauche**.
- Run / Terminal / Problems : onglets du panneau du bas, comme les tool windows du bas d'IntelliJ.
- Retirer de la barre : Structure, npm et les entrées natives (Recherche, Exécuter et déboguer, Extensions…) — cf. §14.6.

### 15.3 Proposer automatiquement les réglages IntelliJ (priorité 1)

- Au premier lancement (et quand une nouvelle version modifie le préréglage) : notification « Appliquer les réglages IntelliJ ? » avec **Appliquer** / Plus tard / Voir le détail.
- Vérifier que **JetBrains Mono** est installée ; sinon proposer le lien et expliquer l'installation « pour moi » (sans admin).
- Choisir Islands Light ou Dark à ce moment-là.

### 15.4 Détails d'interface à reproduire (priorité 2)

- Barre de navigation (fil d'Ariane cliquable) en bas à gauche de la barre d'état.
- Barre d'état à droite : uniquement position, fins de ligne, encodage, indentation, lecture seule.
- Widget d'inspection de l'éditeur (avertissements / erreurs, navigation) : au plus près (barre de titre de l'éditeur ou barre d'état).
- Onglets d'éditeur : onglet actif encadré bleu arrondi (thème Light), icônes de type de fichier.

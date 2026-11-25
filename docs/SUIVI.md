# Suivi — points à revoir

Liste des points ouverts à reprendre avec Tom une fois les lots terminés.
Cocher et dater quand c'est réglé.

## Lot 1 — Socle

- [ ] **Identifiant d'éditeur** (`publisher`) provisoire : `unintellij`. À remplacer par un vrai publisher avant toute publication Marketplace.
- [ ] **Licence** MIT choisie par défaut — à confirmer.
- [ ] **Nom public** : « IntelliJ » est une marque JetBrains ; trouver un display name pour le Marketplace (plus tard).
- [ ] **Réglages déclarés mais encore inactifs** : `keymap.*`, `searchEverywhere.*`, `vcs.*`, `appearance.islandsPlus.enabled` — chacun prend effet avec son lot ; vérifier qu'aucun ne reste inerte à la fin.
- [ ] **Poste de travail** : extensions autorisées au travail ? Droits admin ou « user setup » possible (conditionne Islands+) ?

## Lot 2 — Thèmes

- [x] ~~**Calibrage visuel non fait**~~ — fait le 2026-11-25 par captures d'écran (DevTools) : éditeur, Search Everywhere, Commit, Git log, Structure, Recent Files, Settings. **Calibrage visuel** : capture d'écran impossible depuis la session (écran noir). Comparer côte à côte Rider (Islands Dark / Light) et VS Code sur le même fichier, puis corriger.
- [ ] Couleurs les plus incertaines : fond du **cadre** autour des îles (`frame`), **résultats de recherche** / identifiant sous le curseur, et l'ensemble du **thème clair** (gutter, diff, ANSI).
- [ ] Vérifier la coloration **Angular** (templates, bindings) et **Java** avec jdtls installé (semantic tokens).

## Lot 3 — Icônes

- [ ] **Rendu non vérifié dans VS Code** (même raison que le lot 2) : vérifier les icônes de fichiers dans l'explorateur et surtout l'**alignement vertical** des icônes d'interface (police générée).
- [ ] **Dossiers reconnus par leur nom seulement** (limite de VS Code) : un dossier `java` est toujours « source root » bleu, même sous `src/test/` (vert dans IntelliJ). Pas de marquage par chemin possible avec un thème d'icônes.
- [ ] **Tous les `.java` ont l'icône de classe** « C » : VS Code ne sait pas si le fichier contient une interface, un enum ou un record.
- [ ] **Icônes absentes du pack New UI de la plateforme** : Maven (`pom.xml`), Angular (component/service/module), Spring, Terminal, npm. Elles sont dans les plugins JetBrains, à chercher dans `intellij-community/plugins/*` (licence à vérifier pour chacune).
- [ ] **Icônes d'interface monochromes** (contrainte des polices d'icônes) : Run vert, Debug, etc. perdent leur couleur ; `pinned` ressemble à `pin`.

## Lot 4 — Keymap

- [ ] **Raccourcis jamais testés au clavier réel** : la table est générée et validée (syntaxe, conflits, commandes existantes) mais pas pressée touche par touche. À essayer au travail sous Windows, en priorité `Shift Shift`, `Ctrl+W`, `Alt+Enter`, `Ctrl+E`, `Alt+1`.
- [ ] **`Ctrl+K` (Commit) écrase le préfixe des raccourcis à deux temps de VS Code** (`Ctrl+K Ctrl+S`, `Ctrl+K Ctrl+0`…). Voulu pour coller à IntelliJ, mais ces commandes ne restent accessibles que par `Ctrl+Shift+A`.
- [ ] **Équivalences approximatives** : Move Statement = Move Line ; Introduce Variable ouvre le menu « Extract » ; la tool window Run = Debug Console ; Paste from History absent (pas d'API presse-papiers).
- [ ] Les raccourcis VS Code par défaut qui n'existent pas dans IntelliJ restent actifs (ex. `Ctrl+Shift+P`) — à décider : les laisser ou les neutraliser.

## Lot 5 — Search Everywhere et popups

- [ ] **Rendu non vérifié** : les onglets sont affichés dans le titre du popup (`[All]   Classes   Files…`) faute d'API d'onglets ; vérifier que c'est lisible et que l'ordre des résultats est bien le nôtre (propriété `sortByLabel` non documentée).
- [ ] **Surlignage des caractères trouvés** : c'est VS Code qui surligne, avec son propre algorithme, pas toujours les mêmes lettres que notre matcher (pas d'API stable pour fournir les positions).
- [ ] **Ouvrir à côté** : bouton sur chaque ligne ; pas de `Shift+Enter` (l'API ne transmet pas les modificateurs).
- [ ] **Abréviations de classes sur très gros projets** : on interroge le serveur de langage avec la 1re lettre ; s'il tronque ses résultats, des classes peuvent manquer. À tester sur le projet Angular du travail.
- [ ] **Actions** : les commandes internes de VS Code n'ont pas de titre accessible aux extensions ; l'entrée « All Commands… » ouvre la palette native pour elles.
- [ ] **Java** : Classes/Symbols dépendent de l'extension Red Hat (jdtls) ; à tester quand elle sera installée.

## Lot 6 — Fenêtre Settings

- [ ] **Rendu non vérifié à l'écran** (testé dans un DOM simulé : arbre, champs, recherche, modifications en attente, keymap, plugins).
- [ ] **Onglet d'éditeur, pas une vraie fenêtre modale** : VS Code ne permet pas aux extensions d'ouvrir un dialogue modal personnalisé.
- [x] **Réassigner un raccourci** : fait (Settings › Keymap, bouton ✎, écrit dans `keybindings.json` sans toucher à tes propres entrées).
- [ ] **JetBrains Mono** doit être installée sur le poste (Windows : installation « pour moi » possible sans droits admin) ; le préréglage la met en premier avec repli sur Consolas.
- [x] Sauvegarde auto : le préréglage passe en sauvegarde continue (`afterDelay`, 100 ms), comme ton réglage actuel.

## Lot 7 — Structure, npm, Run

- [ ] **Widget Run dans la barre d'état** (en bas à gauche) : la barre de titre n'est pas accessible sans Islands+. Avec Islands+ (lot 10), à déplacer en haut comme dans IntelliJ si faisable.
- [ ] **npm : pas de double-clic pour lancer** (les arbres VS Code n'ont pas d'événement double-clic) : bouton ▶ en ligne, clic = afficher le script dans package.json.
- [ ] **Options de Structure** (tri, champs, autoscroll) dans le menu « … » de la vue, avec ✓ dans le titre : VS Code n'a pas de boutons à bascule pour les extensions.
- [ ] **Java (Run/Debug, Spring Boot, JUnit, Maven, Services)** : reporté en v2 comme prévu. Les configurations `launch.json` existantes apparaissent déjà dans le widget Run.
- [ ] Debug d'un script npm = « JavaScript Debug Terminal » de VS Code : à essayer avec `ng serve` (le debug Angular se fait surtout côté navigateur).

## Lot 8 — Git : Commit, changelists, branches, Push

- [ ] **Rendu non vérifié à l'écran** (testé : logique, dépôt Git réel temporaire, interface sous jsdom).
- [ ] **Pas de commit partiel de lignes** (IntelliJ permet de cocher des morceaux de fichier dans le diff) : on committe des fichiers entiers.
- [ ] **La zone de staging est réécrite au commit** (comme IntelliJ qui l'ignore) : si tu utilises `git add -p` à côté, ce staging est remplacé par les fichiers cochés.
- [ ] **Fichiers renommés** : à vérifier qu'un renommage se committe bien en un seul « rename » (on stage le nouveau chemin ; l'ancien doit suivre).
- [x] **Vue Source Control native** : masquée — la Commit tool window est dans le conteneur Source Control, les vues natives sont cachées dès que Commit s'affiche (Alt+0 ou clic). Commande « Show VS Code's Source Control Views Again » pour revenir en arrière.
- [ ] **Widget de branche dans la barre d'état** (en bas) en plus de celui de VS Code ; avec Islands+, le placer en haut comme dans IntelliJ.
- [ ] **Push** = popup de confirmation (liste des commits + Push / Force Push) plutôt qu'un vrai dialogue ; suppression de branche distante via la commande native de VS Code.

## Lot 9 — Git log, diff, conflits

- [ ] **Rendu du graphe non vérifié à l'écran** (testé : placement des lignes, rendu SVG sous jsdom, dépôt réel temporaire).
- [ ] **Log limité à 500 commits par page** (bouton « Load more ») ; sur un très gros dépôt, vérifier la fluidité.
- [ ] **Diff et merge = éditeurs natifs de VS Code** aux couleurs IntelliJ (pas une réimplémentation du diff IntelliJ) ; F7 / Shift+F7 pour naviguer entre les différences.
- [ ] **Conflits** : « Yours/Theirs » suivent Git (`--ours/--theirs`) ; pendant un rebase le sens est inversé, c'est rappelé dans le dialogue.
- [ ] **Annotate (blame)** = décoration native de VS Code activée depuis VCS Operations (pas la colonne de gouttière d'IntelliJ).

## Lot 10 — Islands+

- [ ] **Pas utilisable sur ton poste de travail en l'état** : VS Code y est installé en « System setup » (Program Files) → droits admin requis. Le message d'erreur le dit et propose de désactiver. Pistes : version « User setup », ou lancer VS Code une fois en administrateur.
- [ ] **Rendu non vérifié visuellement** : vérifié que le VS Code patché démarre et fonctionne (toute la suite de tests y passe) et que le retrait est exact à l'octet près ; mais l'aspect (îles arrondies, widgets en haut) reste à voir sur ton Mac.
- [ ] **Widgets dans la barre de titre** (projet, branche, Run) : déplacés par script depuis la barre d'état — expérimental, à surveiller (VS Code peut les remettre en bas, le script les re-déplace).
- [ ] **Limites assumées** : pas de changement de hauteur des onglets/lignes d'arbre (VS Code calcule ces tailles en JS) ; police Inter seulement si installée.
- [ ] **Après chaque mise à jour de VS Code** : ré-application automatique au démarrage + demande de rechargement de la fenêtre.
- [x] Les copies de sécurité `*.unintellij-backup` sont supprimées quand Islands+ est désactivé.

## Lot 11 — Documentation et packaging

- [ ] **Release GitHub** : le `.vsix` est publié automatiquement à chaque tag `v*` (workflow Release). Première version : 0.1.0.
- [ ] **Icône de l'extension** dessinée pour l'occasion (îles + couleurs Islands) : à remplacer si tu préfères autre chose.
- [ ] **Publication sur le Marketplace** : non faite (nom public sans « IntelliJ », vrai `publisher`, compte Azure DevOps) — cf. lot 1.

## Retours du 2026-11-25 (après captures)

- [x] Icônes de symboles colorées (SVG New UI) dans Search Everywhere, File Structure et Structure.
- [x] Icônes de type de fichier dans la Commit tool window ; icônes propres à chaque tool window dans Recent Files.
- [x] Fichiers modifiés qui restaient rouges à cause des erreurs : le préréglage désactive cette coloration (ils restent bleus).
- [ ] **Premier clic sur l'icône Source Control** (au lieu d'Alt+0) : tant que la section Commit n'a jamais été dépliée, VS Code affiche encore ses vues ; elles disparaissent dès que Commit s'affiche, et ce choix est mémorisé.
- [ ] **Deux widgets de branche** dans la barre d'état (celui de VS Code et le nôtre) : masquer celui de VS Code par clic droit sur la barre d'état si tu veux.

## Itération 2 — à faire (détail : cahier des charges §14)

- [x] Police et taille — §14.1 : JetBrains Mono embarquée et installable « pour moi » (sans admin), 14 px Windows / 13 px macOS. **À calibrer sur le poste Windows** (capture côte à côte IntelliJ / VS Code).
- [x] Couleurs exactes importées d'intellij-community — §14.2 (valeurs des thèmes ManyIslands Light/Dark et des schémas Light / Islands Dark)
- [x] Cases à cocher / boutons radio IntelliJ dans les webviews — §14.3 (`media/controls.css`)
- [x] Widget de branche avec flèches verte/bleue + Fetch / Update / Push — §14.4 (barre d'état, fetch périodique `vcs.backgroundFetchMinutes`, boutons aussi sur Commit et Git ; bouton de synchro natif coupé par `configurationDefaults`). **Limite** : l'entrée de branche native de VS Code ne peut pas être masquée par une extension → clic droit sur la barre d'état › décocher « Source Control » (Islands+ la masque).
- [x] Widget Run unique + fenêtre Edit Configurations, suppression de la tool window npm — §14.5 (configurations npm enregistrées par espace de travail : script, arguments, variables d'environnement ; launch.json listé et ouvert depuis la fenêtre). Reste : Java / Spring Boot / JUnit / SQL quand ces lots seront faits.
- [x] Disposition : Project + Commit en haut à gauche, exécutions en bas — §14.6 (tool windows npm et Structure supprimées ; Alt+7 → Outline natif, Ctrl+F12 conservé ; `panel.alignment: left` dans le préréglage ; Recherche / Run & Debug / Extensions / Remote / Testing masqués sous Islands+). **Limite** sans Islands+ : VS Code ne laisse pas une extension retirer ses icônes natives → clic droit sur la barre d'activité › décocher.
- [x] Vue Project avec sélecteur « Project ▾ » (Project / Packages / Project Files / Open Files / Changed Files) — §15.1 : conteneur « Project » (icône IntelliJ), modules avec chemin grisé, racines source/test/ressources/exclues avec icônes IntelliJ, nouveau / renommer (refactoring) / supprimer (corbeille) / glisser-déposer / copier le chemin / Select Opened File (Alt+F1). **Limite** : le panneau « Folders » natif ne peut pas être masqué (VS Code l'interdit) → la vue Project est un conteneur séparé, à glisser une fois en haut de la barre (Islands+ masque l'Explorateur natif).
- [ ] Barre de gauche : Project, Commit, Git séparé (en bas si possible, sinon sous Commit) ; Structure et npm retirés — §15.2
- [x] Proposition automatique des réglages IntelliJ + vérification JetBrains Mono + choix Light/Dark au premier lancement — §15.3
- [x] Calibrer d'abord **Islands Light** (thème utilisé au travail) — §15
- [ ] Barre de navigation en bas à gauche, barre d'état épurée, widget d'inspection — §15.4
- [ ] **Base de données PostgreSQL façon IntelliJ** : tool window Database, sources de données (mots de passe sécurisés, couleur par source), sélecteur source/schéma dans les fichiers `.sql`, `Ctrl+Entrée`, résultats en grille — §16 (PostgreSQL uniquement)
- [x] **Triangles verts ▶ dans la gouttière** : scripts `package.json`, tests Java (méthode et classe, via Maven si « Test Runner for Java » est absent), `main` / `@SpringBootApplication`, tests TS/JS (Vitest, Jest ; Karma = fichier entier), ✓/✗ après exécution — §17. Restent : instructions SQL (avec §16), clic droit « lancer les tests du package », Debug des tests Java sans l'extension Microsoft, arbre de résultats détaillé (aujourd'hui code de sortie + sortie dans le terminal).
- [x] ▶ **dans la gouttière à gauche de la ligne**, pas au-dessus (API Testing pour tous les cas) — §17.5
- [x] Barre Git **pleine** (pas hachurée) dans la gouttière, réglée automatiquement — §18.1 (`configurationDefaults`)
- [x] Popup de modification au clic — §18.2 : aperçu natif de VS Code (option 1 du cahier des charges) avec ancien contenu, Précédent / Suivant / Rollback natifs + **Show Diff** et **Copier l'original** ajoutés ; raccourcis IntelliJ (Ctrl+Alt+Z, Ctrl+Alt+Shift+↑/↓). **Écart** : c'est un panneau intégré sous la ligne, pas un popup flottant (VS Code ne donne pas le clic de gouttière aux extensions).
- [ ] Diff complet façon IntelliJ — §18.3 : éditeur de diff natif coloré par le thème, flèches de bloc natives ; restent les en-têtes « Base / Your version » et le bleu « modifié » (VS Code ne distingue qu'ajout/suppression).

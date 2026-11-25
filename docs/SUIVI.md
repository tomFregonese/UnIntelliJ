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

- [ ] **Calibrage visuel non fait** : capture d'écran impossible depuis la session (écran noir). Comparer côte à côte Rider (Islands Dark / Light) et VS Code sur le même fichier, puis corriger.
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
- [ ] **Keymap : on peut désactiver un raccourci mais pas le réassigner** comme dans IntelliJ (il faudrait écrire dans `keybindings.json` de l'utilisateur). À décider si utile.
- [ ] **JetBrains Mono** doit être installée sur le poste (Windows : installation « pour moi » possible sans droits admin) ; le préréglage la met en premier avec repli sur Consolas.
- [ ] Le préréglage « IntelliJ-like » choisit `files.autoSave = onWindowChange` (sauvegarde quand la fenêtre perd le focus) : à valider avec tes habitudes.

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
- [ ] **Vue Source Control native de VS Code toujours présente** à côté de notre Commit tool window : la masquer (clic droit sur la barre d'activité) ou la laisser ?
- [ ] **Widget de branche dans la barre d'état** (en bas) en plus de celui de VS Code ; avec Islands+, le placer en haut comme dans IntelliJ.
- [ ] **Push** = popup de confirmation (liste des commits + Push / Force Push) plutôt qu'un vrai dialogue ; suppression de branche distante via la commande native de VS Code.

## Lot 9 — Git log, diff, conflits

- [ ] **Rendu du graphe non vérifié à l'écran** (testé : placement des lignes, rendu SVG sous jsdom, dépôt réel temporaire).
- [ ] **Log limité à 500 commits par page** (bouton « Load more ») ; sur un très gros dépôt, vérifier la fluidité.
- [ ] **Diff et merge = éditeurs natifs de VS Code** aux couleurs IntelliJ (pas une réimplémentation du diff IntelliJ) ; F7 / Shift+F7 pour naviguer entre les différences.
- [ ] **Conflits** : « Yours/Theirs » suivent Git (`--ours/--theirs`) ; pendant un rebase le sens est inversé, c'est rappelé dans le dialogue.
- [ ] **Annotate (blame)** = décoration native de VS Code activée depuis VCS Operations (pas la colonne de gouttière d'IntelliJ).

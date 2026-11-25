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

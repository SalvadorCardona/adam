# Adam — contexte du projet

Ce fichier est lu au début de chaque session. Il dit ce qui ne doit pas se
perdre d'une session à l'autre : le pitch, la direction artistique, et les
règles d'architecture. Le détail est dans les fichiers qu'il désigne — les
lire avant de toucher au domaine concerné.

## Le jeu

Jeu de construction et de survie 2D pour navigateur mobile (TypeScript, PixiJS v8, Vite).

**Pitch** — `src/data/lore.ts` fait foi. Un futur apocalyptique, quelques
survivants. Le héros est **Adam** ; **Ève** le rejoindra ; des **humains
mutants radioactifs** rôdent. La partie commence sur le chantier de la
**mairie**, qu'Adam doit remplir de bois et de pierre.

**Mécanique centrale** — Adam n'a pas de bouton d'action. Il récolte **de
proximité** : toutes les 10 ticks, les arbres et rochers à portée (`HARVEST_REACH_TILES`, 1,75 tuile ; un cercle menthe discret se dessine au sol sous lui pendant qu'il récolte ; quatre au
plus, du plus proche au plus loin) lâchent une unité (bois, fer, charbon,
pierre), qu'il marche ou non. Il **heurte** le reste : un chantier heurté
reçoit ce qu'il attend ; une foreuse ou une ferme heurtée vide son coffre
dans le sac (« Tout prendre » dans sa fenêtre), ce qui la relance si elle
était bloquée. Une foreuse se pose au **bord** d'un filon : la moitié de
son emprise sur un des gisements qu'elle accepte (`deposits` de
`data/buildings.ts` : fer, charbon, pierre), l'autre moitié sur l'herbe —
deux et deux pour un 2 × 2 (`sim/footing.ts`, `World.footing`, refus
`footing` : « Une foreuse de fer se pose sur 2 cases de fer et 2 cases
d'herbe. »). Armée, elle montre les filons autour d'Adam, rochers compris,
et son fantôme colore chaque case : filon, herbe, fautive en corail ; sa
carte du menu le rappelle en icônes. On casse les rochers du bord, puis on
la pose ; une foreuse d'une ancienne sauvegarde reste où elle est. Rochers et bâtiments sont solides ; d'un arbre, seul le tronc
l'arrête et il glisse autour — une forêt n'est jamais un mur. Un tap sur un
chantier ouvre sa fenêtre : « Transférer » y vide d'un coup ce qu'il attend
— le sac d'abord, puis le stock de la ville s'il est dans son rayon.
**Le dernier objet livré achève le chantier**, sans bouton de validation
(poussière, rebond, son, « Mairie bâtie ! » qui flotte) — sauf dans le
rayon d'un poste de construction, où ses bâtisseurs le bâtissent ensuite.
« Annuler le chantier » (`cancelSite`, pas la mairie) rend le livré à la
ville, ou le pose au sol sans mairie.
Sous la barre d'un chantier, une rangée d'icônes dit chaque objet du coût
en « livré/requis » (`render/siteNeeds.ts`) : complet, estompé et pastille
menthe ; à sec — la ville n'en a plus, rien en route —, en corail. Elle
s'efface au dézoom et au marteau. Sa fenêtre détaille livré / en route /
en ville ; tout se déduit de `World.siteLedger` (`sim/siteLedger.ts`).
Une nurserie ou une forge heurtée (ou « Transférer » : le sac, puis la ville
dans son rayon) reçoit ce que sa recette consomme ; la forge (débloquée au labo, recherche « Fonderie »)
fond fer + charbon en plaques de fer, qui renforcent la tour de guet :
sa fenêtre propose « Renforcer » (niveaux d'amélioration, `upgrades` de
`data/buildings.ts`, commande `upgradeBuilding`, payée sac puis ville).
Le **four à charbon** (`charcoalKiln`, débloqué avec la forge, un ouvrier)
est une forge sur sa propre recette (`burnCharcoal` : 3 bois → 1 charbon) :
une forge trouve la sienne par son id (`recipeOf`, une seule par bâtiment).
Le **grill** (`grill`, débloqué au labo, recherche « Grillades », un ouvrier) en
est une aussi (`grillMeat` : 1 viande → 1 viande grillée) : les porteurs le
ravitaillent depuis la mairie et rapportent les grillées, sans cas spécial. La
mairie convertit toujours la viande crue en nourriture (`HUNTING.foodPerMeat`),
la grillée à `HUNTING.foodPerGrilled`, plus généreux ; `butcherMeat` laisse au
grill en marche son stock visé (`demand`) de viande crue. Visuel dans
`docs/grill/`.
Les porteurs ravitaillent les forges depuis la ville et rapportent leurs
sorties (plaques, charbon) à la mairie ; leurs entrées restent au four.

**Ville et sac** — deux stocks. Le **sac** (`player.inventory`, plafonné)
est ce qu'Adam porte ; la **ville** est le coffre de la mairie
(`World.townStock()`), rempli par Adam (« Déposer en ville », la zone
d'échange de sa fenêtre, ou en la heurtant) et par les porteurs. La fenêtre
d'un bâtiment à coffre (mairie, producteurs, forge, nurserie) a une **zone
d'échange** (`ui/transferPanel.ts`, logique dans `sim/transfer.ts`, commande
`transferItems`) : coffre et sac en deux bandes, un tap passe un objet de
l'autre côté (1 / 10 / Tout), « Tout prendre » / « Tout déposer » ; le sac ne
prend que ce qui rentre, le réservé reste au coffre, un coffre filtré grise
le reste. Les chantiers
puisent dans les deux, la ville seulement dans son rayon (`logisticRadius`,
`sim/warehouse.ts`, le cercle jaune du mode construction). Le HUD
les montre à part : le sac, un bouton carré violet (`.hud-bag`) du groupe `.hud-actions`, tout en bas
à droite, avec « Bâtir » — deux
boutons de `--btn` (48 px, la taille unique des huit boutons du HUD) (pictogramme blanc `bagButton`, « 10/60 »
dans une capsule qui se remplit, l'objet que réclame le conseil, touche I, pastille corail d'une pièce
trouvée) ; la ville, un bandeau d'une ligne en haut à gauche, une maison sans libellé, qui
défile de côté. Le sac (tap, ou touche I) ouvre une seule fenêtre, au format de
l'ancienne garde-robe (`ui/bagPanel.ts`), à deux onglets : **Inventaire**, par
défaut et sans pause (`ui/inventoryTab.ts`), et **Habillement**, l'éditeur
d'Adam (`ui/wardrobeTab.ts`), qui arrête l'horloge (`BagPanel.dressing`).
L'inventaire est une grille de cases (cinq par rangée, deux rangées au
moins, cases vides en creux) : l'icône en grand, la quantité en pastille ;
la jauge et les places libres au-dessus. Une case touchée montre dessous son
nom, sa quantité, 1 / 10 / Tout et « Déposer » (`depositToTown`, `amount`) —
éteint loin de la mairie, où « Jeter » (`dropItem`, `amount`) le relaie ;
en bas, « Déposer en ville » (éteint loin d'elle) ou « Tout jeter ». Sa
section Ville est un tableau de bord (`sim/flows.ts`, `World.flows`) : débit
net par objet sur deux minutes (anneau d'échantillons, pas sauvegardé) et
deux alertes au plus — pénurie d'une recette, surplus que rien n'utilise —
dont le tap pointe un repère de bord vers le bâtiment en cause. Dans le
bandeau de la ville, chaque objet porte sa **tendance** sur la dernière
minute de jeu (`TownFlows.trend`, `TREND_SPAN`) : flèche menthe s'il monte,
corail s'il baisse, rien s'il stagne — seuil d'entrée `TREND_RISE`, de
sortie `TREND_KEEP`, pour ne pas clignoter. Le bouton au bout du bandeau
(`.hud-resources`) ouvre `ui/resourcePanel.ts` : par objet, entrées,
sorties et solde par minute (écart tick à tick du stock), mini-courbe
(`sparklineSvg`) et temps avant épuisement ; partie de test
`/test/trends`. Loin de
la mairie, « Jeter » pose le sac au sol en tas (le mobile `pickup` du
butin, avec `amount`), qu'Adam reprend après s'en être éloigné.
**Outils d'Adam** (`TOOL_GEAR` de `data/gear.ts`, `Player.axe` / `Player.pickaxe`, sauvegardés, absents d'une ancienne sauvegarde : les mains nues) — hache et pioche en trois niveaux, forgées dans la fenêtre de la forge comme l'arc (`craftTool`, `ui/toolForge.ts`, payé sac puis ville). Chaque niveau : +1 unité par coup sur sa famille (arbres ; fer, charbon, pierre), lu dans l'unique `World.bonus` (`woodYield`, `oreYield`, via `toolBonus`). **Combo de récolte** (`ui/harvestCombo.ts`, du ressenti, pas de l'état) : récolter sans s'arrêter plus de 1,4 s fait monter la hauteur du son (`AudioEngine.play(name, pitch)`) et grossir le chiffre qui vole, qui porte « ×N » dès le rang 3.
Tant que la mairie n'est pas debout, Adam ne récolte d'un objet que ce
qu'on en attend (`World.wanted` : chantiers, recettes) plus une réserve
(`SPARE_CARRY`) ; au-delà, il n'en prend plus (`harvestRefused`,
signalé). Ensuite la ville prend tout, sauf ce dont elle a déjà assez
(`TOWN_PLENTY`, 150, `data/items.ts`, et de quoi couvrir les besoins posés — chantiers, améliorations ouvertes, recherches en attente : `World.placedNeed` ; une petite coche dans le bandeau de la ville) : cet objet-là, il n'en ramasse plus en
passant que pour un chantier ou une recette. Le conseil ne dit de livrer que si le sac contient ce qu'on attend.

**Chemins** — décoratifs, jamais de l'état : une allée de terre battue
relie la porte de la mairie bâtie à celle de chaque bâtiment fini à moins
de 40 tuiles (`trailsOf` de `render/meadow.ts`, relus toutes les 30 frames
par `renderer.ts`, bakés avec le sol par `chunkLayer.setTrails`). Ils
apparaissent seuls à l'achèvement d'un bâtiment et disparaissent à sa chute ;
aucun bonus de vitesse. Le joueur ne trace pas de route : les routes pavées
(carte « Route », `paveRoad`) ont été retirées ; leurs dalles d'une ancienne
sauvegarde (`roads`) sont ignorées au chargement.

**Débouchés** — tout objet entre dans un coût de bâtiment, une entrée de
recette (`src/data/recipes.ts`) ou un besoin (l'eau se boit) ; `validatePrototypes()` refuse une
ressource qu'on récolterait pour rien.

**Ouvriers** — la colonie part avec dix ouvriers adultes
(`World.colonists`, `COLONY` de `data/inhabitants.ts`, sauvegardé) et n'en
gagne qu'à la nurserie : un bâtiment n'en crée aucun. Chaque bâtiment
déclare les `workers` qu'il emploie (maison des constructeurs et ferme :
quatre), pris parmi eux. Les **libres** sont sur la carte (`Worker.free`) :
au départ, dix devant le chantier de la mairie, où ils flânent (ni faim ni
soif avant qu'elle soit bâtie). Un bâtiment prend les plus proches de sa
porte : porteurs, bûcherons, forestier, fermiers deviennent son équipe sous le même
id (prénom gardé) ; ceux d'une carrière, d'un puits, d'une foreuse y
entrent (`World.hosted`, non sauvegardé, refait de la répartition au
chargement). Un ouvrier retiré, ou dont le bâtiment tombe, redevient libre
sur place ; une ancienne sauvegarde garde ses équipes et pose les libres
qui manquent devant la mairie (`settleColonists`). Le HUD compte
« libres/total ». Le jour, un libre donne un **coup de main** (`VOLUNTEERS`,
équipe `volunteer` de `JobBoard.assign`) : il porte de la mairie aux
chantiers et aux labos de son rayon, en petites charges ; embauché chargé,
sa charge retourne à la mairie (`dropVolunteerJob`). Il vide aussi, vers la mairie, l'eau et la nourriture d'un producteur à `VOLUNTEERS.fetchReach` (30 tuiles) : la première rive peut être hors du rayon logistique, et le puits n'a ni porteurs ni poste au départ. Sans rien à porter, le jour, un libre **glane** (`GLEANERS`, `sim/gleaners.ts`, `Worker.glean`, sauvegardé) : il réserve — jamais deux sur la même tuile, bûcherons compris — un arbre ou un rocher de pierre du rayon de la mairie, l'arrache à mains nues (`pickTicks`, ~8 s par unité) et rapporte l'unité en ville, sur la tête (même rendu qu'une charge de porteur ; compté « au travail »). Jamais de fer ni de charbon ; au plus `GLEANERS.max` à la fois ; seulement ce que la ville attend (chantiers, labos, recettes, plus `SPARE_CARRY`, `gleanDeficit`) ; ni la nuit ni pendant une vague. Embauché en route, il rend sa charge à la mairie. Ceux de la maison sont des **porteurs** (mobile
`worker`, `src/sim/workers.ts`, `PORTERS` dans `src/data/workers.ts`) : ils
vident foreuses, fermes et cabanes de bûcheron dans la mairie et livrent les chantiers,
la forge et la nurserie depuis la mairie (`sim/consumers.ts` ; une machine en
famine d'abord, `JOB_PRIORITY.starving`). Un consommateur **demande** :
sous son stock visé (`demand` de `data/buildings.ts`, la nurserie : 12
nourritures ; sinon sa part du coffre), il réclame la différence
(`consumerDemands`), servie depuis la mairie ou une ferme voisine
(`SUPPLY.producerReach`). Ordre : un job parti n'est jamais repris ;
chantier = famine > stock visé (`refill`) > vider un producteur >
restes. Sans de quoi, il attend (bulle `starved`) sans bloquer personne. Un job est réservé des deux côtés **à sa création**
(`src/sim/jobs.ts` : `Store.reserveOut`/`reserveIn`, registre des chantiers)
— décider sur `available()`, jamais sur le stock brut. Ligne droite, jamais
à travers l'eau ; à l'abri chez eux pendant une vague. Les réservations ne sont pas sauvegardées : elles se
rejouent depuis les jobs au chargement.
La **cabane de bûcheron** loge deux **bûcherons** (mobile `lumberjack`,
`LUMBERJACKS` dans `src/data/workers.ts`, choix de l'arbre dans
`src/sim/lumberjacks.ts`) : l'arbre le plus proche dans son rayon (cercle
mint au placement et à la sélection), réservé — jamais deux sur le même —,
coupé une unité par coup comme par Adam, le bois rapporté au coffre de la
cabane, que les porteurs vident (priorité d'une foreuse). Coffre plein, ils
attendent devant la porte.
La **maison du forestier** (`foresterHouse`, un ouvrier) loge un
**forestier** (mobile `forester`, `FORESTERS` dans `src/data/workers.ts`,
carré dans `src/sim/forester.ts`) : il plante un carré de `FORESTERS.plot`
cases centré sur la maison (emprise et allée exclues), rang par rang, une
pousse par case d'herbe nue — ni eau, ni bâti, ni filon
(`World.forestPlot`). La pousse grandit au temps de jeu (`SAPLING`,
`data/resources.ts` : pousse, jeune arbre, arbre) ; avant d'être adulte,
elle n'est pas une ressource — ni coupée, ni récoltée, ni solide. Abattu,
l'arbre libère sa case, que le forestier replante. Les arbres plantés
(`ResourceIndex.planted` : tick de plantation, unités prises) sont
sauvegardés sous `planted`. Carré mint au placement et à la sélection.
La **ferme** (`farm`, quatre ouvriers au plus) loge ses **fermiers** (mobile
`farmer`, `FARMERS` dans `src/data/workers.ts`, champ dans `src/sim/farmer.ts`,
le carré du forestier de côté `FARMERS.plot`) : ils sèment la première case
d'herbe nue libre du champ (`World.farmField`), rang par rang, sinon récoltent
la première case mûre — sa place au coffre réservée au départ (`load`,
rejouée au chargement) —, rapportent la récolte au coffre puis reviennent
semer. Deux fermiers ne visent jamais la même case (`plot`). La culture
pousse au temps de jeu, la nuit aussi (`CROPS`, `data/resources.ts` : semis,
pousse, mûre ; ~9 nourritures par minute pour un champ plein de 30 cases) ;
elle n'est jamais une ressource — ni récoltée par Adam, ni solide — et bloque
la pose d'un bâtiment comme une pousse. Sans ferme qui couvre
son champ, elle s'arrache. Pas de recette : toute la nourriture vient des
récoltes. Coffre plein, les fermiers attendent à la porte (`storeFull`).
Cultures sauvegardées sous `crops` (tuile → tick du semis) ; une ancienne
sauvegarde charge un champ vide. Carré jaune au placement et à la sélection.
Depuis sa fenêtre, un producteur (foreuse,
ferme, forge, nurserie, cabane, maison du forestier) se met **en pause** (`pauseBuilding` : il ne
produit ni ne consomme, ses ouvriers finissent leur geste, bulle ⏸ et sprite
pâli sur la carte), et un bâtiment qui emploie règle ses ouvriers entre
`minWorkers` et `workers` (`setWorkers`, sélecteur − / + ; zéro vaut pause) :
`sim/staffing.ts` répartit la population de la ville, un poste sans
ouvrier libre reste vide, « ouvrier manquant ». Chaque bâtiment qui emploie a
une **priorité de travail** — Basse, Moyenne (`WORK_PRIORITY.initial`), Haute
(`setPriority`, boutons segmentés sous le sélecteur ; pastille ↑/↓ au coin du
toit, `art/priority.ts`) : les libres vont d'abord aux postes Haute, et un
poste Haute vide reprend l'ouvrier d'un bâtiment plus bas — en pause d'abord,
puis Basse —, qui finit son geste ; jamais à un bâtiment qui en a gagné un
depuis moins de `holdTicks`, ni à priorité égale (`allocateStaff` part de la
répartition d'avant, sauvegardée sous `staffPosts`). En pause, un bâtiment
garde les siens mais n'en reçoit plus. Porteurs et logisticiens servent
d'abord les bâtiments Haute.
Arrêté sans l'avoir voulu, un producteur porte une **bulle d'alerte**
(`World.problem`, `sim/problems.ts`, liste ordonnée `PROBLEM_ORDER` de
`data/problems.ts` : entrepôt plein, ouvrier manquant, puis entrée attendue — `starved`, la nurserie sans nourriture ; sprite `alert`,
un morceau par problème), qui bat doucement et que sa fenêtre explique en
une ligne. Elle paraît aussitôt et ne s'efface qu'après `holdTicks` sans
problème (tout de suite si le coffre est vidé à moitié) : pas de
clignotement. La pause voulue garde ⏸.
La **carrière** (`quarry`, trois ouvriers, coût tout en bois) taille la
pierre dans les ruines, sans rocher, au rythme de ses ouvriers (recette
`cutStone`) ; porteurs et logisticiens la vident.
Le **poste de logistique** (`logisticsPost`, kind `depot`) loge quatre
**logisticiens** (des `worker` à `logistician: true`, `LOGISTICIANS` dans
`src/data/workers.ts`, caisse au dos) : ils servent d'abord la demande des
consommateurs de son rayon (cercle cyan) — la nurserie à nourrir —, puis
vident ses producteurs dans la mairie, le coffre le plus
rempli d'abord (`Crew` de `JobBoard.assign`). Un producteur couvert par un
poste n'est plus l'affaire des porteurs, qui livrent les chantiers.
Le **poste de construction** (`constructionPost`, kind `yard`) loge quatre
**bâtisseurs** (des `worker` à `builder: true`, `BUILDERS` dans
`src/data/workers.ts`, casque jaune et marteau) : ils livrent depuis la
mairie les chantiers de son rayon (cercle violet), le plus ancien d'abord,
puis, tout reçu, les bâtissent au marteau (`Site.work` jusqu'à
`siteWork()`, `BUILDERS.perSite` ensemble au plus ; `Worker.build`). Un
chantier couvert par un poste qui tourne n'est plus l'affaire des porteurs ;
poste en pause, à zéro ou tombé : ses chantiers prêts s'achèvent aussitôt,
les autres reviennent aux porteurs et à Adam.
Un ouvrier sans travail **flâne** devant chez
lui (`wander()`, hachage de la seed, sans PRNG ni chemin) et ne rentre que
le soir (crépuscule, nuit) ou pendant une vague.
**Âge** (`data/inhabitants.ts`, `sim/inhabitants.ts`) — chacun a un `age`,
sauvegardé, qui prend un an à chaque aube (`ageInhabitants`) ; un adulte
arrivé tout fait a un âge haché de la seed et de son id, son prénom aussi
(`nameOf`, tiré des `CORE_NAMES` premiers de `NAMES`). Aucun vivant ne porte le prénom d'un autre : `pickName` prend celui de `nameOf` s'il est libre, sinon un libre de son sexe ; rangé sous `names` (`World.givenNames`, `settleNames`), une sauvegarde d'avant garde les tirages d'origine. L'enfant sort de la nurserie à 10 ans et n'est
affecté à rien ; à 14, il rejoint les ouvriers de la colonie (`colonists`
+ 1, un ouvrier libre sous le même id, toast « Lina a 14 ans… ») — le porteur `grown` ne survit que dans les
anciennes sauvegardes.
**Sexe** — chaque habitant est une femme ou un homme (`Born.sex`,
sauvegardé ; `SEXES`, `data/inhabitants.ts`) : tiré à sa venue par
`sexOf` (hachage de la seed et de l'id, pas le PRNG du monde), gardé en
changeant de métier ; une ancienne sauvegarde le retrouve au chargement,
et son prénom ne change pas (`NAMES` alterne femme / homme, `nameOf` prend
le sexe). Adam est un homme, Ève une femme (`STORY_SEXES`). Sur la carte,
une femme a une queue de cheval indigo nouée de corail, un homme adulte une
barbe courte (`SEX_LOOKS`, `humanParts` d'`art/people.ts` : le corps d'une
femme est le morceau `woman.*`, que `render/puppet.ts` préfère). Un tap sur
un habitant le fait répondre « Hé ho ! » (homme, grave) ou « Hé ! » (femme,
aiguë) — `VOICES` de `audio/synth.ts`, trois prises Piper par sexe,
`AudioEngine.speak` : une voix à la fois, la suivante coupe la précédente,
sous le muet et le volume des bruitages ; Ève répond aussi. Sa fenêtre
(`ui/creatureView.ts`) est un tableau libellé / valeur, la ligne Sexe en
tête (pictogramme ♂/♀ `male`/`female` d'`art/ui.ts`), le métier accordé.
Un ouvrier dehors sans tâche depuis `IDLE.graceTicks` est **inactif**
(`World.isIdle`, compte non sauvegardé) : le rendu le fait glander (assis,
adossé, s'étire, bâille avec bulle « zzz »), le HUD compte au travail /
inactifs / enfants (`World.census`), et un tap sur les inactifs y jette un
coup d'œil, puis le suivant. Un tap sur un habitant ou un ennemi ouvre la
fenêtre d'un bâtiment (`showCreature`, contenu de `ui/creatureView.ts`) :
portrait, nom, âge, métier ou espèce, ce qu'il fait, où il loge, ce qu'il
porte, points de vie d'un ennemi. Un ennemi a un âge sauvegardé (bornes
`age` de son proto, un an par aube) et un surnom haché (`foeName`, `FOE_NAMES`).

**Traits, noms et réactions** (`data/traits.ts`, `sim/inhabitants.ts`) — chaque
habitant a un `trait` (travailleur, gourmand, peureux, costaud, rêveur) tiré de
la seed et de son id (`traitOf`, hachage), sauvegardé, gardé en changeant de
métier ; une ancienne sauvegarde le retrouve au chargement. Un petit effet,
lu en un point : l'allure (`traitPace`, avec l'humeur : `moodPace`, content
×1,05, malheureux ×0,7), la vitesse des jauges (`drainNeeds`), le poids de la
peur au moral de l'aube (`nightlyMood`). Un enfant qui naît prend parfois le
trait d'un adulte (`bornTrait`, `TRAIT_INHERIT`). Le nom est le prénom tiré de
la seed (`World.nameFor`), sauf si le joueur l'a changé (commande
`renameInhabitant`, `alias` sauvegardé, champ sous la fiche) ; naissance et
mort le nomment. Le moral de l'aube suit aussi la faim, la soif (`MOOD`) et la
peur d'un ennemi approché (`REACTIONS.fearTiles`). Bulles brèves et rares,
non sauvegardées (`World.reaction`) : peur, joie (un ouvrier sur trois après
une naissance), fatigue (la nuit, à tour de rôle) ; faim et soif gardent les
leurs, et passent devant. La fiche dit trait, effet et une ligne de biographie
(`bioRank`, `t().panel.creature.bios`).

**Faim et soif** (`data/needs.ts`, `sim/needs.ts`) — ouvriers, bûcherons et
enfants ont une jauge par besoin (`Needful.needs`, sauvegardée ; une
ancienne sauvegarde part rassasiée et désaltérée), qui baisse plus vite au
travail qu'au repos — la soif deux fois plus vite que la faim. Sous
`seekBelow`, l'habitant lâche sa tâche (son job garde ses réservations),
part manger un `food` ou boire un `water` à la mairie, le besoin le plus
bas d'abord — sa part réservée au départ (`meal`, rejouée au chargement) —
et la reprend. Mairie à sec, il va au producteur le plus proche dont le coffre
en a (`isProducer` : puits, ferme…, `World.mealSource`, en ligne droite) et
réserve sa part là (`reserveOut`, `mealSites` : non sauvegardé, refait au
chargement) ; la mairie reste le premier choix, un coffre vide ou déjà
réservé n'attire personne. Sans de quoi, sous `weakBelow` il va à mi-allure, à zéro il
s'arrête (`stopsWork`) et le compte à rebours de la mort démarre (`deathTicks`, 3 min de faim, 1 min 30 de soif, un repas le remet à rien ; avertissement `starving` au premier tick à bout, puis `workerStarved` : l'ouvrier disparaît, `colonists` baisse, toast avec son nom et la cause ; `World.starve`/`perish`, compte non sauvegardé, enfants épargnés) ; un enfant affamé ou assoiffé ne
prend pas d'année à l'aube (`blocksGrowth`). La mairie bâtie verse
`COLONY.startingStock` (`data/inhabitants.ts` : nourriture et eau pour
que les dix ouvriers tiennent le temps d'un puits et d'une ferme). La
fenêtre d'un habitant (et son infobulle) montre ses jauges (rassasié / a
faim / affamé, désaltéré / a soif / assoiffé ; `ui/needMeter.ts`), une
bulle corail flotte au-dessus d'un affamé (`art/hungry.ts`, l'épi) ou d'un
assoiffé (`art/thirsty.ts`, la goutte), et une capsule corail sous la
population (`World.needAlert`, la plus pressante des deux) dit quand la
ville va manquer ; son tap montre qui a faim ou soif.
L'**eau** (`water`, goutte cyan — le bloc cyan clouté, c'est le minerai de
fer) se tire au **puits** (`well`, un ouvrier) : une carrière sur sa
propre recette (`drawWater`, trouvée par `recipeOf`), posée au **bord**
d'une rivière ou d'un lac (`shore` de `data/buildings.ts`, `touchesWater` de
`sim/terrain.ts`, refus `shore` : « Le puits se pose au bord d'une rivière »).
Les rivières (`RIVER`, `inRiver` de `sim/terrain.ts`) sont des lits de 3 à 5
tuiles qui serpentent, coupés de gués, taillés dans la seed ; aucune à moins
de 30 tuiles de l'origine, pour que le départ et les anciennes sauvegardes ne
bougent pas. Sans rive où poser un puits dans la prairie de départ (région,
zone de base, pollution), le foyer creuse une **mare** de 3 × 3 à 9–14 tuiles
d'Adam (`homePond`, `HOME_POND`) ; une prairie qui a sa rive garde sa carte.
Un puits d'une ancienne sauvegarde, loin de l'eau, tourne toujours. 
Elle n'entre dans aucune recette : un besoin est son
débouché (`validatePrototypes()`). Une sauvegarde d'avant l'eau (version 8)
reçoit l'eau de départ dans sa mairie (`migrateV8`).

**Habitation et bonheur** (`data/housing.ts`, `sim/housing.ts`) — un
bâtiment déclare ses lits (`beds` de `data/buildings.ts`, `bedsOf`) : la
**Maison** (`home`, kind `house` sans ouvriers, 4 lits, au menu dès le
départ), le dortoir des porteurs (4), la maisonnette du forestier (1).
L'Habitation est leur somme ; elle ne bloque rien. Chaque ouvrier adulte sur
la carte (porteur, logisticien, bâtisseur, bûcheron, forestier, ex-mutant,
survivant — pas les enfants, qui dorment à leur nurserie) reçoit un lit
(`Housed.bed`, sauvegardé) : il garde le sien tant que la maison tient, les
autres prennent le lit libre le plus proche de leur travail (`assignBeds`,
`World.settleBeds` : chaque seconde, à chaque changement de maisons ou
d'ouvriers, au chargement). À la nuit, un oisif entre dans sa maison
(`inside`) ou, sans lit, s'allonge devant la porte de son travail
(`sleepingOut`, recalculé à chaque tick : sprite `sleeper`) ; une vague le
renvoie s'abriter chez son employeur. À chaque aube, `MOOD` s'ajoute au
`happiness` (0–100, sauvegardé ; 50 au départ et d'une vieille sauvegarde) :
lit +15, dehors −10 ; sous 30, malheureux (bulle `unhappy`, `moodOf`) et
×0,7 sur son pas (`moodPace`, lu par `walkToward`) — Adam jamais. Un autre
besoin qui pèsera sur le moral est une entrée de `MOOD` et une ligne de
`moodCauses`. Le HUD montre « logés / habitants » (`World.housing`) sous la
population, en corail si quelqu'un dort dehors ; la fenêtre d'un habitant,
son bonheur et « Dort à : Maison / dehors » ; celle d'un bâtiment à lits,
ses lits occupés. Partie de test `/test/housing` : le soir tombe, dix
ouvriers, quatre lits.

**Campement du départ** (`sim/camp.ts`, `render/adamRing.ts`) — tant que la mairie n'est qu'un chantier, un feu de camp (décor `campfire` de `data/decor.ts`, jamais tiré au hasard, posé par `ChunkLayer.setCamp` et éteint à l'achèvement) brûle à `CAMP.fireAhead` cases de sa façade ; les dix colons se placent en couronne autour (`campSpot`, hachage de la seed, jamais une grille) et flânent/glandent comme d'habitude. Adam porte un anneau orange au sol, permanent, plus un halo de 4 s au lancement et après chaque réapparition (coupé sous `prefers-reduced-motion`) ; la caméra cadre Adam à ×1,25 la première seconde (`Camera.intro`).

**Jour et nuit** — dès que la mairie est debout, le cycle démarre
(`src/data/dayNight.ts`, horloge pure dans `src/sim/dayNight.ts`) : une
journée sans mutant (~3 min), un crépuscule (carte teintée indigo, lampions
allumés, « La nuit tombe — rentrez »), une nuit (~100 s) dont la vague sort des bases mutantes à sa tombée, puis
l'aube : les mutants restants fuient et le butin tombe dans le sac. Le rendu
(`render/nightLayer.ts`) n'applique que la teinte : un quad `multiply` et des
lueurs `add`, pas de filtre. Le HUD l'affiche en **horloge** en haut, juste
à droite de la population (`World.dayDial`, `DIAL_ARCS` : aube, jour, crépuscule, nuit à
leurs vraies durées ; cadran `dayDialSvg` de `art/ui.ts`) : l'aiguille porte
le soleil, la lune la nuit, « J2 » à côté (un de plus à chaque aube) ; à
`DAY_DIAL.nightWarning` de la nuit, elle bat en corail ; un tap dit « Jour 2 ·
nuit dans 1:31 » (c'est aussi son `aria-label`).
**Enjeu de la nuit à l'écran** (`NIGHT_STAKES`, `data/dayNight.ts` ; minuteurs de vue, la simulation n'en sait rien, tout coupé par `prefers-reduced-motion`) — voile plus profond (`veilStrength`) et lueurs plus fortes ; au cor, secousse de caméra, puis à la sortie le bord de l'écran pulse en corail 2 s du côté de la base de tête ; chaque mise à mort fige le temps 40 ms (`render/timeDilation.ts`), le dernier mutant le ralentit 0,4 s avant le grand bandeau « vague repoussée » ; compteur « abattus/sortis » à côté de la capsule de vague (`.hud-tally`) ; mairie sous 50 % de PV (`render/hallDanger.ts`) : vignette corail qui bat, repère de bord qui grossit, grosse caisse de la nuit plus sourde et plus forte (`AudioEngine.setDanger`).

**Passer la nuit** — une nuit calme (`World.calmNight` : vague abattue ou
jamais sortie, Adam debout, pas d'ami) montre à côté de l'horloge un bouton
« Passer la nuit » (`.hud-hasten`, pictogramme `hasten`) ; actif, la boucle
de `main.ts` fait `HASTEN.speed` fois plus de ticks par image jusqu'à l'aube
— un mutant qui reparaît l'arrête. La simulation n'en sait rien.
**Faveurs de l'aube** (`data/boons.ts`, `sim/boons.ts`, `ui/boonPanel.ts`) —
chaque aube propose trois cartes hachées de la seed et de la nuit
(`World.boonOffer`) ; la capsule violette `.hud-boon` les ouvre (l'horloge
s'arrête), « Plus tard » les garde jusqu'à l'aube suivante. Une carte prise
(`chooseBoon`) est un colis versé en ville ou un coup de pouce sur une
statistique de la recherche jusqu'au crépuscule (`World.activeBoon`, lu par
`World.bonus` ; capsule menthe et son temps). Sauvegardés sous `boonOffer` et
`boon`.
**Étoiles filantes** (`data/starfall.ts`, `sim/starfall.ts`) — dès la nuit 2,
une nuit sur trois environ (hachée de la seed, jamais le PRNG du monde), Ève
l'annonce au crépuscule (`starfallAnnounced`) et des étoiles tombent toutes
les 7 s autour de la mairie, à 5–15 tuiles, sur une case explorée où l'on
marche : chacune laisse un éclat au sol (le `pickup` du butin, `star: true`,
sauvegardé) — minerai, charbon, pierre, parfois une plaque — qui luit la nuit
(lampe de `render/nightLayer.ts`) et éclaire le brouillard (`FOG_VISION.star`).
Une raison de sortir, la vague abattue, plutôt que d'attendre l'aube.
**Défi du jour** (`data/challenges.ts`, `sim/challenges.ts`) — chaque jour,
de l'aube à l'aube, un petit but tiré de la seed (jamais deux fois de suite
le même) : récolter, livrer, bâtir, abattre, explorer. Il se lit dans la
quête sous les objectifs (`.hud-quest-daily`, `World.challenge`) et paie dès
sa réussite, en objets et en Prestige (`challengeCompleted`). Sauvegardé
sous `challenge`.

**Carte du jour** (`data/dailyMods.ts`, `sim/daily.ts`, `ui/dailyMap.ts`) — le
bouton « Carte du jour » de l'écran titre ouvre `?daily=AAAA-MM-JJ` (date UTC) :
la graine (`dailySeed`) et le modificateur (`dailyMod`, même hachage) ne
dépendent que de la date, donc sont les mêmes pour tous. Le modificateur
(`World.dailyMap`, sauvegardé) est une donnée lue en un point : `World.bonus`
(`bonuses`), `dailyCycle` (puits), le pas des mutants (`foeSpeed`), le départ
de la colonie (`startingWorkers`). Pas de bonus du jardin. Sauvegarde à part
(`DAILY_SAVE_KEY`, `adam:daily-save`) : la partie principale n'est ni lue ni
écrite ; une partie d'un autre jour est effacée à l'ouverture. Score = graines
du `ColonyScore` (`seedsFor`), mesuré à l'aube, à la chute et au Signal ; le
meilleur du jour vit sous `adam:daily` (`storage/localDaily.ts`) et s'affiche à
l'écran titre. Avec un serveur : `GET|POST /daily/:date` (`server/src/daily.ts`,
migration `0005`), le meilleur score de chaque compte ; sans, rien ne change.

**Rôle d'Adam la nuit** (`data/skills.ts`) — quatre leviers pour que la nuit
ne soit pas un temps mort. La **Volée** (`castSkill`, `World.skill`,
`VOLLEY`) : trois flèches en éventail vers la direction du joystick, sinon
l'ennemi le plus proche, sinon le regard d'Adam ; recharge 8 s, sauvegardée
(`skillReadyTick`) ; du crépuscule à l'aube (`World.skillOn`), bouton orange
`.hud-skill` à gauche du sac (anneau de recharge, temps au centre), Espace au
clavier et □ / X à la manette (`castVolley` de `main.ts` : le tiroir de
construction garde Espace tiroir ouvert ou placement en cours), son `volley`.
Les **traqueurs** (`HUNTERS`, `Mutant.hunts`, sauvegardé) : dès la nuit 2, un
assaillant sur quatre (haché de la seed, de la nuit et du rang, jamais le PRNG)
marche sur Adam plutôt que sur la mairie tant qu'il est à `sightTiles`, et le
frappe au contact (`strikeHunted`). Le **combo de nuit** (`COMBO`,
`World.combo`) : chaque mutant abattu à moins de `windowTicks` du précédent le
fait monter, le multiplicateur gagne ½ tous les trois ; le Prestige en plus est
mis de côté (`combo`, sauvegardé) et versé à l'aube (`comboPaid`) ; un
bâtiment frappé (`comboBroken`) le perd. Capsule `.hud-combo` près de
l'horloge. La **nuit nette** (`CLEAN_NIGHT`) : la vague abattue toute, l'aube
est avancée à 20 s (`EarlyDawn` de `sim/dayNight.ts`, `earlyDawn` sauvegardé) ;
l'aube dure alors jusqu'à l'heure normale du lever — jamais un décalage de
`cycleStartTick`, dont la météo dépend — et l'aube paie en plus du Prestige et
un lot (`cleanNight`). « Passer la nuit » et la Reine n'y changent rien.

**Menace** — la nuit, des **mutants** sortent des bases mutantes : une
vague par nuit (`WAVES`, `src/data/enemies.ts`), à sa tombée, faite des
assaillants que chaque base a produits le jour (voir Bases mutantes) ; rien
n'apparaît ailleurs, et sans base debout la nuit est calme. Ils marchent
droit sur la cible de leur vague (`Mutant.target`, sauvegardée) : une fois
sur deux, pour chaque base, le bâtiment de l'usine fini le plus proche
d'elle (`WAVES.targets` : foreuse, ferme,
carrière, cabane, forge), sinon la mairie, qui reprend la main si la cible
tombe ; ils traversent tout sauf le bâti, qu'ils cassent. Un bâtiment
abattu, hors mairie, redevient son chantier, à moitié livré (`RUIN`). Une vague
s'annonce de loin (voir Annonce longue), et trois secondes avant (bandeau avec son effectif, ses bases, la direction de la plus proche — `World.leadBase` — et sa cible, cor grave, léger recul de caméra vers elle —
pas si un bâtiment est armé ou une fenêtre ouverte, et un tap n'ouvre rien
pendant que la carte glisse),
sort de chaque base par sa porte, l'un après l'autre (`RAIDS.exitStagger`), d'une flaque vert fluo — un mutant qui émerge
(`WAVES.emergeTicks`) n'est pas visable — et finit sur « Nuit N — vague repoussée ! » ;
**Annonce longue** (`WAVE_WARNING`, `World.waveForecast`, `sim/waves.ts`) :
2 min 30 avant sa sortie, une capsule « Vague dans 2:30 ×N » à droite de
l'horloge (`.hud-wave`, corail et qui bat sous `urgentTicks` ; un tap montre
la base), un repère de bord vers la base de tête, un trait corail sur la carte
du monde, un toast et la notification « Vague annoncée » (type `attack` des
Notifications, `waveAnnounced`) si la fenêtre n'a pas le focus.
L'effectif annoncé est exact : la production des bases se déroule d'avance
(`projectedRaiders`). Pas de vague hors ligne : onglet caché, le jeu est en pause.
Grâce des trois premières nuits (`WAVE_STRENGTH.earlyCaps`, `earlyCap`) : la réserve commune des bases est plafonnée à 2, 3, 4 assaillants, quel que soit le nombre de bases du premier anneau, et la prévision suit. Ces nuits-là, la mairie ne descend pas sous `WAVE_STRENGTH.graceHallFloor` de ses PV : elle sort abîmée, jamais à terre. Force (`WAVE_STRENGTH`) : la cadence des bases (le temps), plus des renforts
de la base de tête — `perEra` par ère (`waveEraOf` : fin de l’acte I, Signal) et
un par `buildingsPerRaider` bâtiments au-delà de `freeBuildings`, palissades
exclues (`World.townSize`). Abattue toute avant l'aube, une vague paie sa
prime en ville (`WAVE_BOUNTY`, `waveRewarded`, `bountyNight` sauvegardé).
Défenses de la recherche « Fortifications » (onglet Bâtiments du labo) : la
**tour d'archers** (`archerTower`, kind `tower`, deux ouvriers : sans eux elle
ne tire pas, à un, deux fois moins vite) et la **palissade** (`palisade`, kind
`wall`, 1 × 1, 3 bois) qui arrête un mutant le temps qu'il la casse. Tout
bâtiment abattu, hors mairie, redevient son chantier (`RUIN`) ; un chantier
n'arrête pas un mutant (`blockerAt`).
tout ennemi abattu (mutant, crabe, loup) lâche au sol le butin de sa table
(`loot`, tirée du PRNG du monde ; `LOOT_DROPS`, `src/sim/loot.ts`) qu'Adam
ramasse en marchant dessus — sac plein, il reste au sol. L'arc d'Adam et la tour de guet
(`src/data/weapons.ts`) tirent seuls. La mairie à zéro = partie perdue.
La courbe vient des bases : chaque nuit, elles produisent plus vite
(`RAIDS.paceGrowth`) et en gardent plus (`capacityEvery`), les anneaux
lointains s'éveillent plus tard (`raid.from`). Les chefs sont une table
(`NIGHT_BOSSES`, cinq dernières nuits répétées) : un **gros mutant**
(`brute`) dès la nuit 5, et aux nuits 10, 15, 20…
la **Reine des flaques** (`queen`, `QUEEN`), tous sortis de la base la plus proche de la mairie :
annoncée la veille au crépuscule par Ève, compte à rebours au bandeau
(`World.queenCountdown()`). Phase 1, elle marche sur la mairie et pond des
larves (`larva`) ; sous la moitié de ses PV, elle plonge (`stepQueen`,
`sim/enemies.ts`) et ressort à quatre cases de la tour la plus proche, qu'elle
charge pour la raser — des tours qui se couvrent. Jamais assommée (`stunnable`) ; à
l'aube, elle repart ; abattue, elle lâche un **cœur radioactif** (`radCore`). Adam **répare** un
bâtiment abîmé en le heurtant avec du bois, ou via « Réparer » (sac puis
ville ; `REPAIR`, `src/data/buildings.ts`). Frappée hors écran, la mairie
sonne l'alarme : bord rouge, repère qui clignote, vibration.
`src/sim/defense.test.ts` mesure l'équilibre (Adam immobile, Ève qui répare :
deux tours passent la nuit 9, et celle de la Reine si l'on répare, une seule
tombe aux nuits 8–10 ; l'usine isolée, AFK, y laisse des plumes en six nuits,
deux tours par bâtiment la sauvent ; deux tours de base, la Reine en rase
une ; quatre renforcées, elle tombe avant l'aube).
La **nurserie** fait naître un enfant toutes les trois minutes, contre six
nourritures (recette `raiseChild`) : sans elles, elle attend ; pleine
(`NURSERY_CARE.capacity`, quatre enfants), aussi. Sa fenêtre montre ses
enfants et le temps avant le prochain ouvrier (`World.nextAdultTicks`).

**Clinique** (`src/data/clinic.ts`, débloquée au labo, « Médecine de fortune ») — tant
qu'elle a une place, un mutant vaincu peut tomber **assommé** (étoiles, pas
de butin) au lieu de s'évaporer : mobile `patient`, ni ennemi ni cible.
Adam le touche, il le suit en boitillant jusqu'à la porte ; après une
« nuit » de soins (deux minutes : pas de cycle jour-nuit), il en ressort
**ex-mutant**, un porteur logé à la clinique, plus fort et plus lent
(`EX_MUTANT`, `src/data/workers.ts`). Ses places comptent patients et
ex-mutants logés : une clinique pleine n'assomme plus personne. Oublié dix
secondes, ou sans clinique, l'assommé s'évapore et lâche son butin.

**Armée de compagnons** (`src/data/companions.ts`, `src/sim/companions.ts`) —
la **caserne** (`barracks`, kind `barracks`, famille Attaque) est débloquée au
labo par la recherche « Milice » (`militia`) : le labo est ce qui fait entrer au
menu les bâtiments hors histoire (forge, clinique), un objectif ou une quête ne
servant qu'à l'histoire. Sa fenêtre (`ui/barracksPanel.ts`) montre trois cartes
— **guerrier** (corps à corps, beaucoup de PV), **archer** (tire de loin, recule
sous `keep` tuiles, peu de PV), **soigneur** (ne combat pas, rend des PV à Adam
et au compagnon le plus blessé à portée) —, leur coût en icônes, « Recruter »
(commande `recruitCompanion`, payé sac puis ville dans le rayon, refus
`RecruitRejection`) et l'armée actuelle. Une seule formation à la fois par
caserne (`Barracks.training`, `endTick`, sauvegardé) ; au bout, le compagnon
(mobile `companion`, `Companion`) sort par la porte. Plafond `COMPANIONS.max`
(5) **formations comprises**, toutes casernes confondues ; un compagnon tombé
libère sa place. Ils suivent Adam en arc derrière lui (`formationSlot`, le
guerrier devant, le soigneur au fond), ne sont dans la collision de personne,
engagent l'ennemi le plus proche parmi ceux qui sont à `engageRange` d'Adam
puis reviennent, et le rejoignent d'un bond s'ils sont trop loin ou coincés
(`teleportRange`, `stuckTicks`). Un ennemi au contact les frappe (une fois par
seconde au plus). Ni faim, ni lit, ni population. Le HUD les compte dans la
bulle de la population (`n/5` et une jauge de santé réunie). Compagnons et
formation sont sauvegardés (mobiles `companion`, `training` de la caserne) ; une
ancienne sauvegarde se lit sans compagnons. Partie de test `/test/army`.

**Ève** — ingénieure bricoleuse, taquine (`src/data/eve.ts`, `src/sim/eve.ts`).
Elle **tutoie** Adam, qui reste muet ; le jeu (bulles, boutons, écrans)
**vouvoie** le joueur. Les conseils du HUD sont ses répliques, par radio
tant qu'elle n'est pas là. Elle arrive en vélo-cargo une fois la nuit 3
repoussée (population : 2 adultes), vit devant la mairie, répare le bâti
entre les vagues, et se tape pour lui parler (bulle au-dessus d'elle,
jamais bloquante). Elle porte la chaîne de quêtes (`src/data/quests.ts`) :
chaque quête récompense un **plan** (un bâtiment `plan: true` n'entre au
menu qu'une fois donné) ou un **outil**. Seul `questsDone` est de l'état.

**Caravane de troc** (`src/data/caravan.ts`, `src/sim/caravan.ts`) — à
partir du jour 4, un jour sur deux, 30 s après l'aube, une charrette (mobile
`caravan`, sauvegardé) se gare à 8 cases de la mairie pour 90 s. Au
contact, la fenêtre Troc (`ui/caravanPanel.ts`) propose ses échanges, tirés
de la seed et du jour : surplus de la ville → ce qui lui manque (5 pour 1),
butin → plaque de fer, une offre rare plafonnée sur la partie
(`rareTrades`). Commande `trade`, une fois par échange, payée sac puis ville.

**Labo de recherche** (`src/data/research.ts`, `src/sim/research.ts`) — on y
choisit une recherche, on dépose son coût (sac, ville dans le rayon,
porteurs, ou en le heurtant), puis le compte à rebours tourne ; une à la fois
par labo, les suivantes en file (`PRODUCTION.queueSize`, `data/production.ts`,
`Lab.queue`, `dequeueResearch`) et payées à leur tour ; plusieurs labos
mènent plusieurs recherches de front, jamais la même (refus `taken`).
« Abandonner » une recherche qui tourne rend son coût au coffre. Le temps
restant d'une production (naissance, recherche) est `World.productionTimer`,
en « m:ss » (`timerText`) sous la barre du bâtiment sur la carte et dans sa
fenêtre ; les durées restent à `RECIPES.raiseChild` et `RESEARCH[id]`. Lancer ne prend rien à la ville : tant que le
coût manque, le labo porte au-dessus de lui la rangée d’un chantier
(`World.labLedger`, même `render/siteNeeds.ts`), et sa fenêtre le même relevé
(`ui/siteNeedRow.ts`). Le coût mêle objets communs et **butin
d'ennemis** : gelée de mutant, croc de loup, pince de crabe, objets qu'on ne
récolte nulle part. Un effet est un modificateur additif sur une
statistique, lu en un seul point, `World.bonus(stat)` ; les données ne
bougent pas — Adam (arc, sac, pas, PV max `maxHp`), les habitants (allure
`workerSpeed` lue par `World.walkStep`, cadence `workSpeed` par
`World.toil`, faim et soif `hungerResist`/`thirstResist` par `drainNeeds`),
foreuses, dépollution (`purifyTicks`). Le labo est **de départ**
(`START_BUILDINGS`) : sans lui, rien ne s'ouvrirait. Une recherche peut
**débloquer des bâtiments** (`unlocks` : la Fonderie, forge et four à
charbon ; la Médecine de fortune, la clinique ; la Milice, la caserne ; la
Dépollution, la station), lus par `World.isUnlocked` ; aucun objectif ni
quête n'en demande un. Elle peut aussi **ouvrir** un bâtiment de base
qu'une colonie neuve n'a pas (`opens` : puits, cabane et maison du
forestier, tour, carrière et foreuse, poste de construction) ; ceux-là, une
quête ou un objectif peut les demander, leur recherche ne coûtant que ce qui
se récolte. `validatePrototypes()` vérifie que chaque bâtiment du menu a son
chemin (départ, plan, objectif, labo). Ève envoie au labo quand le bâtiment
qu'elle conseille n'y est pas encore (`labOpen`, `labResearch`) ou qu'il faut
des plaques. `researchDone` est de l'état ; la recherche en cours est celle
du labo. Une sauvegarde d'avant (version 9) tient pour finies les
recherches qui ouvrent ce qu'elle avait déjà (`migrateV9`). La fenêtre du
labo est le panneau Recherche (`ui/researchPanel.ts`) : en tête ce qu'il
mène (relevé du coût, puis la barre verte « m:ss »), puis trois onglets
— Bâtiments, Ouvriers, Personnage (`theme`), chacun portant le nombre de recherches à lancer —, en grille de cartes compactes (2 à 3 colonnes dans la fenêtre large du bureau, une sur téléphone ; abordables d'abord, les autres estompées, verrouillées et finies au bout) dont chaque recherche dit son
icône (`icon`), son effet ou ce qu'elle débloque, son coût, sa durée, son
état (verrouillée : le prérequis nommé) et « Lancer ».

**Ères** (`src/data/eras.ts`, `sim/eras.ts`, `ui/eraPanel.ts`) — quatre
paliers : **Campement** (le départ, `START_BUILDINGS`), **Bourg**, **Ville**,
**Cité industrielle** ; `World.era` (index, sauvegardé ; absent d'une ancienne
sauvegarde : 0, le Campement). On passe à la suivante depuis la fenêtre de la
mairie (« Ères · Campement », pastille corail quand tout est réuni) : un
panneau liste ses conditions (`eraChecks` : chapitres finis,
habitants, bâtiments finis, recherches clés, investissement payé sac puis
ville) et ce qu'elle apporte ; « Passer à l'ère » pousse `advanceEra`
(refus `EraRejection`). Chaque ère peut ouvrir au menu des bâtiments
existants (`opens`, versés dans `World.openBuildings` ; vide pour l'instant,
le labo ouvre ceux de base dès le Campement), ouvre les **régions** de son
anneau (`REGION_RINGS[].era` : le Bourg le deuxième, la Ville le troisième),
un **onglet de recherches** au labo après les trois thèmes (`era` de
`data/research.ts`, `World.researchOpen` ; la recherche d'une ère plus
tardive est refusée `locked`), dont celle qui débloque sa
chaîne — briqueterie (`brickworks` : pierre + bois → brique), atelier
(`workshop` : plaque + bois → outils), aciérie (`steelworks` : plaques +
charbon → acier), des forges sur leur recette —, une menace ajoutée aux chefs
de chaque nuit (`threat`, `withEraThreat` : mutants, gros mutants) et un
visage de mairie (morceaux `era1`…`era3` de `art/townHall.ts`). Le passage
(`eraReached`) arrête l'horloge sur un écran plein (nom, devise, récapitulatif,
fanfare `colony`, pluie de feuilles) jusqu'à « En avant ! ». Ève le signale
(`eraReady`). L'histoire (objectifs) ouvre la porte d'une ère, l'ère ouvre
l'économie ; `validatePrototypes()` vérifie qu'une ère ne demande que ce que
les précédentes rendent accessible. Partie testée de bout en bout dans
`sim/eras.test.ts`.

**Objectifs** — la partie est une suite de dix **chapitres** en données
(`CHAPTERS` de `src/data/objectives.ts`, jugés par `src/sim/objectives.ts`),
chacun avec plusieurs objectifs ouverts à la fois, faits dans l'ordre qu'on
veut ; le suivant s'ouvre quand tous sont réussis (`World.chapter`,
`World.objectivesDone` par id, `World.chapterBase` ; événements
`objectiveCompleted` puis `chapterCompleted`). Le premier toit (la mairie,
seule), les fondations (labo, cabane, carrière, puits, maison), passer la nuit
(3 nuits, 2 tours de guet, 4 palissades), les demandes d'Ève (ses quêtes,
postes de logistique et de construction), nourrir la ville (élevage, ferme,
20 pains, premier enfant), l'industrie (20 fer, 20 charbons, 10 plaques,
20 briques), une ville où l'on veut vivre (clinique, 20 grillades, bonheur
moyen 80 : `mood`), tenir (5 nuits, 2 tours d'archers, caserne) → « Acte I
terminé » (`banner`, `ACT_ONE_CHAPTER`), préparer le Signal (Cité
industrielle : `era`, 10 outils, 10 aciers, station de dépollution), puis
l'**Antenne** → victoire « Le Signal », puis la partie sans fin. Un objectif
ne demande que ce qui est à portée quand son chapitre s'ouvre — recherche,
plan, ère (`data/reach.ts`, `chapterReach`, vérifié par
`validatePrototypes()` et `objectives.test.ts`). Une sauvegarde de
l'ancienne chaîne de sept (version 10, `LEGACY_OBJECTIVES`, `migrateV10`)
reprend au premier chapitre qui contient un ancien objectif pas réussi, les
anciens cochés, sans récompense redonnée.

**L'Antenne** (`antenna`, kind `antenna`, unique, 3 × 3) — débloquée par
la fin de l'acte I (`unlockChapter`), posée à 8 cases au moins de la mairie,
de centre à centre (`hallDistance`, refus `nearHall`, disque corail du
mode construction). Trois étages : le premier est un chantier ; les deux
autres sont ses `upgrades`, mais **livrés** dans son coffre comme un
chantier — heurt, « Transférer » (`supplyBuilding` : sac puis ville),
porteurs — et l'étage monte quand tout y est (`sim/antenna.ts`, la
commande `upgradeBuilding` refuse : `delivered`). Chaque étage fini fixe
`World.lureNight` : cette nuit-là, toutes les vagues la visent (la Reine
garde la mairie). Abattue au-dessus du premier étage, elle n'en perd qu'un.
Le troisième lance le Signal (`signalSent` : l'émetteur s'allume, ondes
`SIGNAL_WAVES` de `render/signalLayer.ts`, Ève : « Quelqu'un répond ! »),
puis l'écran du Signal. Ensuite, chaque aube, `SURVIVORS` (1 à 3, PRNG du
monde) survivants arrivent : des porteurs `survivor` logés à la mairie. Le
record « nuits tenues après le Signal » (`World.nightsAfterSignal()`) vit
sous sa propre clé (`storage/localRecord.ts`, à côté du jardin) et
s'affiche à l'écran titre.
La case de la barre montre le chapitre (vignette, nom, « 2/4 ») ; la
fenêtre de la quête, une ligne par objectif (bouton : icône, titre, jauge,
coché et en sourdine une fois réussi), l'objectif choisi au doigt ou à la
croix de la manette déplié en jauges dessous (le chantier de la mairie, une
jauge par objet), la quête d'Ève en cours dessous ; le conseil d'Ève retombe
sur celui de l'objectif choisi (`tutorialAdvice`, `selected`, ou le chemin
du labo qui ouvre son bâtiment) ; touché par le joueur (`chosen`), il passe
devant tout conseil qui ne presse pas. Un producteur au coffre plein que rien
ne vide (ni poste de logistique à portée, ni porteurs) lui fait conseiller un
poste de logistique (`storeStuck`). Chaque objectif réussi a sa petite
célébration (jingle, toast, la case rebondit), chaque chapitre la grande
(fanfare, pluie de feuilles, bandeau), et une récompense concrète (objets,
places de sac relues dans les objectifs réussis — `objectiveBagBonus` —,
réparation de la mairie). Un objectif dont le bâtiment n'est pas au menu porte
un cadenas et « Au labo : Bûcheronnage (8 bois, 4 pierres) » sous son titre
(`objectiveLock`, `sim/objectives.ts`) ; le toucher montre le labo, ou son chantier
(`labSpot`) ; tant que le labo est l'objectif et que son fer manque, le repère de
gisement pointe le filon de fer (`labIronShort`, `ui/hint.ts`). Ce qui est fait en avance compte ; un objectif
réussi le reste ; les nuits à « tenir » se comptent depuis l'ouverture du
chapitre. Une condition qui n'attend qu'une horloge (naissance,
nuit à tenir : `goalWait`/`objectiveWait`) affiche son temps restant, ou en
corail ce qui la retient ; Ève enchaîne alors sur de quoi s'occuper
(réparer, une tour, l'objet le plus bas en ville, une recherche).

**Succès et collection** (`src/data/achievements.ts`, `src/sim/achievements.ts`,
`src/sim/collection.ts`, `ui/collectionPanel.ts`) — une trentaine de succès en
données, chacun une condition « statistique ≥ but » (`STATS` : jauges lues sur
le monde, compteurs de colonie tenus au fil des événements dans
`Collection.run`, remis à zéro à chaque nouvelle colonie ou chute de la mairie).
Quatre difficultés : premiers pas, progression, défis (nuits d'affilée sans
perte ou sans mort de faim…), secrets (cachés à la collection tant qu'ils ne
sont pas obtenus). `AchievementTracker` contrôle une fois par seconde de jeu ;
un succès obtenu lance un toast animé (`Hud.notifyAchievement`). Récompenses
cosmétiques : un **skin** (pièce de la garde-robe, offerte par la commande
`grantPieces` à l'obtention et, en silence, au départ de chaque colonie) ou un
**trophée** (décoration, variante de bâtiment : exposé à la collection, pas
encore dessiné sur la carte). Les **bâtiments rares** (`RARE_BUILDINGS`) se
trouvent en les bâtissant une fois. La collection n'est pas l'état d'une
partie : clé `adam:collection` (`storage/localCollection.ts`), jamais
effacée par « Recommencer ». L'écran Collection s'ouvre depuis l'écran titre et
la pause.

**Hors ligne** (`data/offline.ts`, tous les réglages ; `sim/offline.ts`,
`World.catchUp`) — à la réouverture (ou au retour d'un arrière-plan),
`main.ts` mesure l'absence depuis `savedAt` (`awayMs` : horloge reculée ou
date illisible → 0) et pousse la commande `catchUp`. La ville la rattrape
en agrégé, par pas d'une minute, bornée à `OFFLINE.maxMs` (8 h, lu par
`World.offlineCapMs()`), rien sous `minMs` ni sans mairie : producteurs à
leur cadence moyenne (en ville s'il y a des porteurs ou logisticiens,
sinon dans leur coffre jusqu'au plein), forges, naissances, recherches et
formations qui avancent, repas et gorgées habitant par habitant. Ni jour,
ni nuit, ni vague, ni mort : sans vivres, la jauge s'arrête à
`starvedGauge` et reprend en jeu. Le récap « Pendant votre absence »
(`ui/offlineRecap.ts`, événement `offlineCaughtUp`) arrête l'horloge ;
« Récupérer » fait voler les gains vers la ville. Rien de sauvegardé en plus.

**Ville qui évolue** (`art/levels.ts`, `sim/decor.ts`, `data/housing.ts` `DECOR`) — la
mairie, la maison, la carrière et la foreuse montent à trois niveaux
(`upgrades` de `data/buildings.ts`, « Bâtir en pierre » dans leur fenêtre,
commande `upgradeBuilding`, payée sac puis ville) ; chaque niveau a un
bonus lu en un point (`logisticRadiusOf` : rayon de la mairie, `bedsOf` :
lits d'une maison, `speedOf` : durée d'un cycle de carrière ou de
foreuse) et le troisième attend la recherche « Maçonnerie » (`research`
d'un niveau, `World.upgradeLocked`). Le style suit l'ère : le niveau 1 est
le bois tel qu'on le bâtit, le 2 la pierre (soubassement de moellons
corail, chaînages, fanion corail), le 3 la brique (soubassement orange,
lanternes, guirlande, étendard doré) — `levelled(base, niveau, spot)`
pose l'ornement sur les morceaux `built` / `damaged` du sprite de base,
même cadre, même ancre. Les **décorations** (`kind: 'decor'`, famille
« Décor » : parterre, banc, lampadaire, fontaine, statue d'Adam, sprites
`art/ornaments.ts`) sont des bâtiments sans ouvrier ni coffre, posés
comme les autres, qui se **retirent** d'un tap (`removeDecor`, le coût
retourne en ville) ; à chaque aube, chacune ajoute son `mood.amount` au
bonheur des ouvriers à `mood.radius` tuiles, dans la limite de
`DECOR.maxPerDawn` (`restInhabitants`, `decorMoodAt`). Elles se
gagnent : chapitre (`unlockChapter`, les parterres et bancs après les
3 nuits, la statue après l'acte I) ou exploration (`unlockExplored`, la
fontaine : cases explorées du brouillard). Une ancienne sauvegarde charge
tout au niveau 1 (`level` absent). Planche : `docs/niveaux/`,
`npm run art:sheet -- planche.svg 3 Niveaux`.

**Prestige** (`src/data/prestige.ts`, icône `PRESTIGE_ICON`) — un compteur
de la colonie (`World.prestige`, sauvegardé ; absent d'une vieille
sauvegarde : 0), ni porté ni stocké. Chaque bâtiment achevé rapporte
`BUILD_PRESTIGE` une seule fois par emplacement (`prestigeSites` : une
ruine rebâtie ne paie pas), chaque ennemi vaincu `KILL_PRESTIGE` ;
événement `prestigeGained`, « +N Prestige » flottant, médaille et nombre
en tête du bandeau de la ville, en haut à gauche du HUD (sous la barre sur un téléphone). Rien ne le dépense encore.

**Niveaux d'Adam** (`src/data/levels.ts`, `src/sim/levels.ts`) — chaque
ennemi abattu rapporte de l'XP (`KILL_XP` ; une base et son chef, `BASE_XP`
par niveau de base) : seule l'XP totale est de l'état (`Player.xp`, absente
d'une ancienne sauvegarde : niveau 1), le niveau (`World.level()`, borné à
`MAX_LEVEL`, courbe `XP_CURVE`) s'en déduit. Qui a tiré compte
(`XP_SHARE`, `Arrow.shooter`) : Adam en plein, les compagnons de l'armée à
moitié, les tours pas du tout. Chaque niveau donne `LEVEL_GAINS` : des PV max
(`World.maxHp()`) et des modificateurs additifs sur les statistiques de la
recherche, cumulés avec le labo dans l'unique `World.bonus(stat)`. Un niveau
passé soigne Adam (événement `levelUp`, toast, confettis) ; le niveau et la
barre d'XP ouvrent le bandeau de la ville (`.hud-level`), « +N XP » flotte
sur l'ennemi.

**Garde-robe d'Adam** (`src/data/wardrobe.ts`, `src/sim/wardrobe.ts`,
`ui/wardrobeTab.ts`) — Adam se dessine en **calques** (`art/adamLook.ts`) :
peau, sac, écharpe fixes, puis une **pièce** par emplacement (`LOOK_SLOTS` :
cheveux, yeux, barbe, haut, pantalon, chaussures, lunettes, chapeau ;
`PIECES`, rareté, `starter`) et trois nuanciers de la palette (`LOOK_COLORS` :
yeux, cheveux et barbe, haut). Un calque range ses formes à des profondeurs
(le sac derrière de face, devant de dos) ; pantalon et chaussures sont dans le
pied, qui alterne à la marche. Le rendu recompose les morceaux `adam.down/up/
side/foot` dans une petite page à part quand Adam se change
(`SpriteLibrary.dress`, `Puppet.refresh`) : aucun sprite de plus. L'éditeur
est l'onglet Habillement de la fenêtre du sac (pastille sur le sac et l'onglet :
pièce trouvée), qu'ouvre aussi le « Essayer » du toast « Nouvel objet : … » ; il arrête l'horloge, tient un
brouillon et pousse `dressAdam` à « Valider » (refus `LookRejection`). Une
pièce se **trouve** (`WARDROBE_LOOT`) : coffre de la carte, objectif réussi,
base abattue et son chef — plus de pièces, et plus rares, plus la base est
loin (`BASE_WARDROBE_LOOT`, par niveau) —, la Reine, parfois une bête ;
tirage haché de la seed et de l'événement (`drawPieces`), jamais le PRNG du
monde, jamais un doublon : les raretés de la source d'abord, puis toute pièce
qui manque, et, garde-robe complète, du Prestige (`WARDROBE_SPARE`, toast).
Les **coffres** (`data/chests.ts`, `sim/chests.ts`, sprite `chest`,
`render/chestLayer.ts`) : un au plus par chunk, tiré de la seed sur une case
nue hors de la clairière, jamais stocké ; Adam l'ouvre en passant à
`CHESTS.openTiles` (`chestOpened` : couvercle qui bascule, gerbe, confettis,
« Coffre ouvert ! »), il reste ouvert sur la carte ; fermé, il bloque la pose
d'un bâtiment (`occupied`), le forestier et la ferme. Une pièce trouvée porte
« Nouveau » dans l'éditeur, et son onglet une pastille, jusqu'à ce qu'on
ouvre son onglet (`Player.unseenPieces`, commande `seePieces`). Sauvegardés :
`Player.look`, `Player.wardrobe`, `Player.unseenPieces` et les coffres
ouverts (`chests`) ; une sauvegarde d'avant lit l'Adam par défaut et aucun
coffre ouvert. Parties de test `/test/wardrobe` (l'éditeur ouvert, une
partie des pièces trouvées) et `/test/chest` (Adam à trois pas d'un coffre).
Captures dans `docs/wardrobe/`.

**Points d'intérêt** (`data/discoveries.ts`, `sim/discoveries.ts`,
`render/spotLayer.ts`) — explorer rapporte. Trois sortes, tirées de la seed
par chunk, jamais stockées : le **coffre** (ci-dessus, qui donne en plus du
butin), la **ruine** (sprite `ruin`, scintillante ; fouillée en passant à
`searchTiles`, elle donne au poids de son palier un **plan** — un bâtiment masqué
du menu, `World.openBuildings`, jamais redonné —, une pièce rare
(`WARDROBE_LOOT.ruin`) ou du butin d'ennemis pour la recherche) et le **secret**
(une touffe d'herbe à l'éclat discret au pied d'un arbre, sprite `secret`,
sans repère de bord). Densité (`chance`) et tables de butin (`DiscoveryLoot`)
sont par **palier** de distance au départ (`DISCOVERY_TIERS`, calés sur les
anneaux de bases) : plus loin, plus dense et plus riche ; `validatePrototypes()`
les vérifie. Le butin est haché de la seed et de l'id du point (pas le PRNG du
monde) ; il va au sac (avant la mairie, sous `carryLimit` — le surplus attend
au sol), événement `discoveryFound`, et le HUD le fait voler vers le sac
(`Hud.flyFindsToBag`). Trouvés = `chests` (coffres) et `spots` (ruines, secrets)
dans la sauvegarde ; une ancienne sauvegarde n'en a aucun. Le repère de bord
(`IndicatorLayer.pointSpot`, violet, étincelle, distance en mètres comme la
mairie et le gisement) et la carte du monde montrent coffres et ruines pas
encore trouvés, sur les cases explorées.

**Rencontres sur la route** (`data/encounters.ts`, `sim/encounters.ts`) — trois
sortes, tirées de la seed par chunk comme les ruines (`encounterOfChunk`, jamais
stockées, hors des 24 tuiles du départ), de plus en plus fréquentes par palier
(`DISCOVERY_TIERS`, `chance`). Le monde montre celles des chunks voisins à
`spawnTiles` d'Adam et les range au-delà de `despawnTiles` (`World.stepEncounters`) ;
seules les **résolues** sont de l'état (`encounters` : ids, absent d'une ancienne
sauvegarde : aucune). Le **survivant blessé** (mobile `wanderer`, rôle `wounded`) :
Adam le touche, il le suit en boitant (l'allure du patient) jusqu'à la porte de la
mairie, où il devient un ouvrier libre sous le même id (`colonists` + 1, toast
avec son prénom, `survivorJoined`) ; un ennemi à `fearTiles` le fait fuir
(`woundedFled`), et trop longtemps loin d'Adam il renonce et attend. Le **marchand
ambulant** est une charrette `Caravan` à `encounterId` (ni la caravane du calendrier,
`World.caravan()` l'ignore) : une seule offre rare par palier (`waysideOffer`), la
fenêtre Troc, payée sac puis ville ; l'échange fait, il repart. La **biche dorée**
(`wanderer`, rôle `deer`, sprite `art/deer.ts`) fuit Adam sous `flinchTiles` ; rester
entre les deux distances `catchTicks` remplit sa jauge et elle laisse une pièce de
garde-robe (source `encounter`). Une rencontre vue (case explorée) mais pas résolue
porte un « ? » violet : repère de bord (`IndicatorLayer.pointSpot`) et carte du monde.
Hasard des flâneries haché de la seed (jamais le PRNG du monde). Partie de test
`/test/encounter`.


**Bases mutantes** (`src/data/enemyBases.ts`, `src/sim/enemyBases.ts`) —
à la création de la partie, des anneaux de campements (`ENEMY_BASE_RINGS` :
34, 54, 76 tuiles de la mairie, niveaux 1 à 3) se tirent de la seed, sans
PRNG du monde, sur des emprises libres ; la clairière (22 tuiles au moins)
reste à bâtir. Une base debout tient une zone (`zoneRadius`, disque fluo
pâle au sol, `render/enemyBaseLayer.ts`) : ni chantier (refus
`enemyZone`), ni récolte d'Adam ou des bûcherons
(`World.enemyZoneAt`) ; les mutants des vagues passent. Son emprise arrête
Adam ; son arc la vise quand aucun ennemi n'est à portée, mais ne l'entame
qu'avec un **arc** de son niveau au moins (`player.gear`, `data/gear.ts`,
forgé dans la fenêtre de la forge, commande `craftGear`) — sinon « Il vous
faut un meilleur équipement ». Abattue, elle reste à zéro PV dans
`World.enemyBases` (sauvegardé) : zone libre, `World.prestige` monte, butin
au sol. Un tap ouvre sa fenêtre (`BuildingPanel.showBase`). Une sauvegarde
d'avant les pose au chargement, sauf là où le bâti tient déjà la zone.
Deux sortes de mutants par base. Les **assaillants** (`RAIDS.proto`, le
mutant) : le jour seulement, elle en produit à la cadence de son niveau
(`raid` de `ENEMY_BASE_LEVELS` ; `breed`, compte `brood` qui tient d'un jour
à l'autre) jusqu'à sa capacité (`raidCapacity`) ; le badge de la base
(`sign0`…`sign9`) dit sa réserve (`raiders`), qu'elle lâche toute à la
tombée de la nuit — le badge retombe. Les **gardiens** (`WILDLIFE.guardian`,
seau violet et couvercle-bouclier, `art/guardian.ts`) : des bêtes logées
par la base (`Beast.guardOf`, `guards` comptés et refaits le jour,
`mend`), qui ne sortent flâner devant que quand Adam passe à
`GUARD_RANGE.showTiles` et rentrent au-delà de `hideTiles`
(`World.stepGuards`, comme une tanière) ; ils chargent Adam qui entre dans
la zone et ne quittent jamais leur laisse (`stepBeast`). Parmi eux, les
**cracheurs** (`WILDLIFE.spitter`, jabot de gelée, `art/spitter.ts` ;
`guards.spitters`, comptés dans `spitters`) tirent de loin des crachats
(mobile `spit`, `SPITTER`, `combat.ts` : lents, sans anticipation, ils
s'esquivent et s'écrasent sur le bâti), gonflent leur jabot avant chaque
tir et reculent si Adam approche. Chaque base a un **chef**
(`WILDLIFE.chief`, cône de chantier et massue, `art/chief.ts`) : ses PV,
coups, Prestige et butin sont ceux de son niveau (`chief` de
`ENEMY_BASE_LEVELS`), sa barre de vie est toujours visible ; il lève sa
massue et un cercle corail se remplit au sol une seconde (`CHIEF.slam`,
`Beast.slam`) avant le coup de zone. Tant qu'il vit (`EnemyBase.chief`,
PV gardés rentré), la base est sous **bouclier** (`isShielded`, morceau
`shield` du sprite, refus `enemyBaseShielded`) ; hors combat il se refait
d'un point toutes les `CHIEF.regenTicks` ; abattu (`enemyChiefDefeated`),
il ne revient jamais. Abattue, une base
ne produit ni n'envoie plus rien. Réserve, comptes, gardiens, chef et
cracheurs sont sauvegardés ; une sauvegarde d'avant charge ses bases à
réserve vide, chef et cracheurs au complet. Partie de test `/test/raid` :
Adam devant la base la plus proche, l'arc cerclé de fer au poing.

**Régions à conquérir** (`data/regions.ts`, `sim/regions.ts`) — la carte se
découpe en régions autour de la mairie, tirées de la seed, jamais stockées :
la **prairie de départ** (disque de `HOME_REGION.radius`, 30 tuiles), puis
trois anneaux (`REGION_RINGS` : 30–56, 56–80, au-delà de 80 tuiles ; 5, 6 et
8 secteurs aux bords ondulés), 20 régions en tout. Chacune prend le **biome**
qui la marque le plus dans ce que la génération y pose (`regionBiomes` : part
rapportée à la moyenne) — forêt, côte, montagne, terres polluées (`BIOMES`).
Une région non conquise est voilée (`FOG_TINT.regionAlpha`,
`render/fogLayer.ts`) et inconstructible (refus `region`).
Son **gardien** — Grand loup, Crabe géant, Colosse des carrières, Roi des
boues : une bête de `WILDLIFE` à l'habitat `region`, la bête d'origine en plus
grand (`scale`) — veille sur son repaire (`Region.lair`) et ne se montre
qu'une fois l'**ère** de l'anneau atteinte (`ERAS` de `data/eras.ts` :
Campement dès le départ, Bourg, Ville ; `World.era`, `regionState` :
`conquered` / `open` / `locked`). Plus loin, plus coriace
(`hpScale`, `damageScale`). Abattu (`World.conquer`, événement
`regionConquered`), la région est conquise : Prestige, XP, et sa
**spécialité** au sol (ambre, nacre, quartz, spore violette), qu'Adam déniche
aussi en récoltant dans les régions conquises du biome (`findChance`, tirage
haché) et que le labo emploie (quatre recherches). Une colonie neuve
(`newColony`) ne tient que la prairie ; un `new World` les tient toutes.
Sauvegardé sous `regions` (conquises, vie des gardiens blessés) ; une
sauvegarde d'avant tient pour conquises la prairie et les régions où se tient
du bâti. La carte du monde hachure de jaune les régions à
conquérir (repaire en point corail), voile les verrouillées, borde chaque
région d'un liseré, et sa légende le rappelle. Partie de test `/test/regions`.

**Brouillard de guerre** (`data/fog.ts`, `sim/fog.ts`, `render/fogLayer.ts`)
— trois états par case, comme Age of Empires : inexplorée (brume indigo),
explorée hors de vue (voile indigo, capture figée), visible. Sources de
vision, en disques qui s'additionnent (`FOG_VISION`) : Adam (7), les
habitants dehors (3), chaque bâtiment, chantier compris (3 depuis le bord de
son emprise), la tour de guet finie (13). Calcul incrémental : un compteur
par case, une source ne repeint que si elle change de tuile
(`World.watchSight`, en fin de tick) ; le rendu est une texture d'un texel
par tuile, adoucie et agrandie, refaite à chaque `FogOfWar.revision`, que
peint un shader (`render/fogShader.ts`) : l'inexploré en nappes de deux tons
de l'indigo (`FOG_TINT.unexplored`, `cloud`) qui dérivent, au bord gonflé en
nuages ; ce bruit (`fogClouds`) ne dépend que de la seed — rien de la carte
ne fuit (`fogShader.test.ts`). La
capture est en copie sur écriture : une ressource qui change hors de vue
range son état d'avant (`ResourceIndex.watch`, `World.lookAt`) ; une base
mutante sortie de la vue est copiée (`World.knownEnemyBases`) — jamais vue,
elle ne se montre ni ne se tape. Ennemis, bêtes, flèches, butin, caravane ne
se montrent ni ne se tapent hors des cases vues (`World.sees`), leurs repères
de bord et halos non plus. On ne bâtit ni ne pave sur l'inexploré (refus
`unexplored`). Sauvegardés : cases explorées (plages par chunk) et captures,
sous `fog` ; une sauvegarde d'avant explore `FOG_VISION.legacy` autour du
bâti et d'Adam. Une colonie neuve connaît sa clairière : `FOG_VISION.home`
tuiles explorées autour de la mairie. Débogage : `?nofog` en dev, ou F panneau `?debug` ouvert
(commande `setFog`). Une partie de test explore `SCENARIO_REVEAL` autour de
la mairie.

**Terres polluées et radioactives** (`data/contamination.ts`,
`sim/contamination.ts`, `World.land`) — deux sols tirés de la seed par un
champ de bruit (`CONTAMINATION` : taille des plaques, seuils, clairière
épargnée), jamais stockés : la **polluée** (boue violette) et, au cœur des
plaques, la **radioactive** (orange, trèfle jaune). Aucune ne se bâtit
(refus `polluted` / `radioactive`, cases en corail au fantôme). La **station
de dépollution** (`purifier`, 2 × 2, sans ouvrier, `PURIFIER` : débloquée
au labo, « Dépollution », rayon 4 depuis le bord de l'emprise, une case toutes les 60
ticks, la plus proche d'abord) rend saine la terre polluée de son rayon ;
les cases nettoyées sont de l'état (`cleaned`, absent d'une ancienne
sauvegarde : aucune). La radioactive ne se nettoie pas ; ce qu'elle permet
tient dans `CONTAMINATION_KINDS`, pour qu'on l'enrichisse sans toucher au reste.

**Faune** — en plus des mutants, des **crabes** vivent sur le sable et des
**loups** au cœur des forêts (les gardiens des bases sont de la même famille, sans tanière) (`WILDLIFE`, `src/data/enemies.ts` ;
`src/sim/wildlife.ts`). Leurs tanières se tirent de la seed par chunk ; une
tanière se peuple hors de la vue d'Adam et loin du village, sous un
plafond. Ils ne s'en prennent qu'à Adam (qui a des PV et, s'il tombe, reste à
terre `DEATH.respawnSeconds` — `data/death.ts`, écran « Vous êtes mort »,
`World.respawnTicks`, sauvegardé — le monde tournant, puis se relève à la
mairie ; à terre, ni pas, ni chantier, ni tir : `DEAD_COMMANDS` seules passent) ; l'arc d'Adam vise l'ennemi le plus proche, bête ou
mutant, et le marque (`player.target`) ; les tours ne visent que les mutants.

**Élevage de cochons** (`data/pigs.ts`, `sim/pigs.ts`, bâtiment `pigPen`, débloqué au
labo par la recherche « Élevage », onglet Bâtiments) — la viande ne vient plus
que de la chasse : le **cochon sauvage** (mobile `pig`, sprite `pig`) est rare,
paisible, et flâne au cœur des forêts autour d'un point tiré de la seed par
chunk (`pigSpotsOfChunk`, jamais stocké ; `PIGS.wild`) ; ce n'est pas un `Foe` :
il n'a pas de points de vie, ne frappe jamais et l'arc d'Adam ne le vise pas.
Pas de bouton pour l'apprivoiser : Adam reste à `PIGS.tame.radius` tuiles
pendant `PIGS.tame.ticks`, et le cochon le suit (`PigState` : `wild` →
`follow` ; un seul à la fois). Trop longtemps au-delà de `looseDistance`
(`patienceTicks`) ou une bête / un mutant à `scareDistance`, il détale
(`flee`, événement `pigFled`) puis se calme et redevient sauvage, apprivoisable
de nouveau — jamais tué, jamais perdu pour de bon. Le point d'où il vient reste
vide `PIGS.wild.respawnTicks` (état dans `World.dens`, sauvegardé) : on en
retrouvera un plus tard. Arrivé à `PIGS.enterDistance` d'un élevage qui a de la
place, il y entre (`pigPenned`) : il n'est plus un mobile, l'élevage le compte
(`PigPen.pigs`). Un seul cochon suffit : chaque cochon (`PIG_FARM.capacity`, 3)
donne `meatPerPig` de viande par cycle (`cycleTicks`) dans le coffre, que
porteurs et logisticiens vident ; pas de reproduction, pour que chaque cochon
se mérite. S'il y a du grain en ville (`PIG_FARM.feed` : de la nourriture, dans le
rayon de la mairie, au-delà de `keepInTown`), le cycle en prend et va
`speed` fois plus vite. Sans cochon : pas de cycle, bulle `noPig` (« Ramenez un
cochon de la forêt »). L'élevage abattu libère ses cochons, qui s'enfuient
(`pigsEscaped`) et redeviennent sauvages. Sauvegardés : le mobile `pig` et
`PigPen` (`pigs`, `endTick`, `blocked`) ; une ancienne sauvegarde n'en a pas.
Partie de test `/test/pigs` (`nearPig` : Adam à trois pas d'un cochon).

**Météo** — lue dans la seed et le temps de jeu, jamais stockée
(`src/data/weather.ts`, `src/sim/weather.ts`) : pluie acide (Adam ralenti,
bâtiments abîmés rongés, sauf à l'abri près de la mairie), coup de vent
(flèches en arc, mutants poussés), brouillard (portée des arcs réduite),
arc-en-ciel radioactif (récolte doublée). Annoncée 10 s à l'avance ; une
météo `harsh` ne tombe jamais sur une nuit de vagues (`spoilsNight`). Rendu en `ParticleContainer`
(`render/weatherLayer.ts`).

**Notifications** (`data/notifications.ts`, `ui/notifier.ts`,
`storage/localNotifications.ts`, `public/sw.js`) — le navigateur prévient quand
le jeu n'a pas la main (`document.hidden` ou sans focus) : recherche finie,
enfant né, vivres bas (`World.needAlert`, au passage de « tout va bien » à
« ça manque »), vague annoncée (`waveAnnounced`, sinon `waveCountdown` ; une fois par vague). Sans
serveur ni Web Push : la partie s'arrête onglet caché et rien n'arrive page
fermée, donc rien à notifier tant que le jeu n'a pas de temps hors ligne.
Réglages (section Notifications, cachée si l'API manque) : un interrupteur par
type et un plafond par jour (1, 3, 5, 10 ; `Notifier.cycleLimit`), gardés sur
l'appareil (`adam:notifications`, jamais dans la partie). La
permission n'est jamais demandée au lancement : `NotificationPrompt` explique
d'abord, après la première recherche lancée (une fois, `explained`) ou depuis
les réglages ; il arrête l'horloge. Android n'accepte que les notifications d'un
service worker : `sw.js` les pose et ramène le jeu au premier plan au tap.
iOS : seulement dans une PWA ajoutée à l'écran d'accueil (16.4+), et jamais
sans que la page tourne.

- **Accessibilité** (`storage/localUiScale.ts`, `storage/localContrast.ts`, `data/contrast.ts`, bloc final de `style.css`) — réglages de l'appareil, jamais de la partie : « Taille de l'interface » (100 / 115 / 130 %, `adam:ui-scale`, variable racine `--ui-scale` lue par `zoom` sur `.hud`) et « Contraste élevé » (`adam:contrast`, `data-contrast` sur `<html>` : indigo foncé, toasts blancs, voile plus sombre), appliqués à chaud par `main.ts`. Un état ne tient jamais à sa seule couleur : point d'exclamation devant un compte en alerte et sur un objet à sec, coche ou point d'exclamation dans la pastille d'un toast, flèches montante / descendante des tendances, signe +/− des soldes. Un texte tient AA (4,5:1) : `TEXT_PAIRS` de `data/contrast.ts`, testé ; la menthe n'y suffit pas, le texte « bon » est `--good-text`. `prefers-reduced-motion` coupe les boucles du HUD, les rebonds, les secousses de caméra et les confettis (`render/motion.ts`).

## Direction artistique

**Vectoriel « post-apo joyeux » : la vie reprend ses droits sur la ruine.**
Ruines arrondies envahies de lianes, fleurs, drapeaux, échelles, grues,
antennes ; les mutants sont drôles plus qu'effrayants.

**Charger le skill `art-direction` (`.claude/skills/art-direction/`) avant
toute création ou modification de visuel.** Référence :
`docs/art-direction.md` (règles, palette chiffrée, construction, maquette et
dessins de l'illustrateur dans `docs/art-direction/`) ; version exécutable :
`src/data/artDirection.ts` (`PALETTE`, `GROUND`, `RADIUS`, `STROKE`, `LIGHT`,
`FAMILY_TONES`, helpers SVG, `auditSvg`).

**Tout nouveau visuel est un SVG construit avec les helpers de
`artDirection.ts`.** Pas de couleur tapée à la main (le type `Color` la
refuse), pas d'image générée par un modèle, pas de pixel art.

Les règles, en résumé :

- formes pures (capsules, rectangles très arrondis, cercles), **aucun contour** ;
- trois tons par objet : base, ombre de même teinte tirée vers le violet/bleu
  (jamais gris, noir ni transparent), reflet en capsule ; lumière en haut à gauche ;
- palette courte et saturée ; l'**indigo** remplace le noir et le marron ;
- traits réservés aux petits détails, **une seule épaisseur**, bouts ronds ;
- arbres en coussins de feuillage empilés sur un tronc indigo, pas en boules ;
- des détails qui racontent une vie plutôt que de la texture ;
- ombres portées pleines, teinte foncée du sol ;
- vue de dessus 3/4, grille lisible ;
- une teinte dominante par famille, sans collision — vert fluo réservé aux
  mutants (seule exception : la touffe de l'ex-mutant, un humain orange) ;
- personnages lisibles à petite taille (Adam : sac à dos, écharpe, arc ;
  mutants : tête déformée, bras trop long, halo vert).

## Icônes et HUD

- Une ressource = une icône : `src/data/icons.ts` est un
  `Record<ItemId, string>` (un SVG de 24 × 24, helpers de la DA). Un objet
  sans icône ne compile pas ; `validatePrototypes()` vérifie cadre et règles.
- `src/ui/hud.ts` : quête, conseil contextuel (le tutoriel), sac, bulles,
  gains flottants, défaite. `src/ui/screens.ts` : écran titre et pause — la
  simulation ne tourne qu'après « Jouer » et hors pause. L'écran titre est une
  scène : key art en trois plans qui respirent (`titleScene` d'`art/brand.ts` :
  Adam de dos sur la colline, la mairie et ses lampions, Ève au loin, un mutant
  derrière une ruine), logo dessiné en capsules (`titleLogo`), histoire en deux
  phrases (`LORE.tagline`, le (i) déplie `pitch`), carte « Continuer » qui dit
  jour, colons, chapitre et date (`peekSave`, sans charger le monde), gestes du
  jeu avant la toute première partie seulement (`adam:played`,
  `storage/localPlayed.ts`) ; tout tient sans défiler à 390 × 700. Captures
  dans `docs/start-menu/`. Police arrondie :
  Fredoka, embarquée via `@fontsource` (ses chiffres ne se confondent pas).
  L'interface suit les règles des sprites : cartes blanches et capsules,
  trois tons (couleur, « face avant » pleine plus sombre, reflet en capsule),
  aucun contour ; couleurs de `PALETTE` recopiées en variables dans
  `style.css` (`--accent`, `--good`, `--danger`…). Pas d'emoji : les
  pictogrammes sont des SVG de `src/art/ui.ts`. Le panneau de debug ne
  s'affiche qu'avec `?debug` en dev.
- Le haut de l'écran (`.hud-top`) est **une seule rangée**, une grille collée
  en haut — la zone sûre plus `--hud-margin` (8 px), rien d'autre : à gauche
  (`.hud-left`) la ville en bandeau d'une ligne qui défile de côté (le Prestige
  en tête, séparé par un filet, puis la maison sans libellé et les objets), la
  **population** dans sa propre bulle blanche (`.hud-people` : au travail,
  inactifs, enfants, logés, bonheur — icônes et chiffres comme la ville, sans
  air de bouton ; corail quand ça va mal, seul « inactifs » se tape ; sous la
  ville sur un téléphone), l'**horloge du jour** juste à sa droite et l'alerte
  de vivres ; au centre (`.hud-main`) la barre ; à droite (`.hud-right`) la
  météo. Pause, Réglages, la carte du monde et le zoom forment une rangée de
  disques en haut à droite (`.hud-zoom`, dernière rangée de la grille de `.hud-top`) ; le bord droit n'a plus de colonne. Sous 600 px (téléphone en portrait), les six boutons passent en colonne sur ce bord, à côté de la barre, de la ville et de la population : la quête, ouverte sous la barre, ne les couvre jamais. Tous les boutons du HUD prennent
  `--btn` (48 px, 44 px sous 400 px de large) et `--btn-icon`, posés sur `.hud`. **Une seule variable de hauteur, `--hud-h`**, posée sur `.hud-top` et
  ajustée par paliers (34, 36, 38, 42 px ; 38 sur un téléphone couché) : la
  barre et chaque bloc des deux groupes la prennent, sans marge ni `top` ni
  hauteur à eux ; chaque bloc est sa propre carte blanche, aux rayons de la
  barre (`--hud-r`), sans cadre qui englobe un groupe. Tout tient sur une ligne
  dès 1600 px (la barre 420 px au plus, le groupe de gauche `--hud-side`,
  520 px, la droite à sa taille) ; en
  dessous, la barre (avec les contrôles dès 600 px) reste en haut, le groupe de
  gauche prend toute la largeur de la rangée dessous — la ville y lit ses
  stocks — et la météo, quand elle tombe, une dernière rangée (`.hud-right`
  sans météo n'occupe rien). `src/ui/hudTop.test.ts` verrouille ces
  règles dans `style.css` : un bloc du haut qui prend sa propre hauteur, une
  marge ou une transformation casse le test.
  La **barre** (`.hud-topbar`, 920 px au plus, 420 sur la rangée unique) ne
  porte plus que l'**objectif**, sur toute sa largeur, à la hauteur des cases
  (`--cell-h`, tirée de `--hud-h`) (`.hud-objective`, jaune : icône et progression, intitulé court dès
  420 px ; il rebondit en menthe quand
  une étape est réussie). Les alertes (corail) ne changent pas la taille d'une
  case. La grille se resserre par paliers (< 360, 360, 420, 600, 900 px) et
  tient sur une ligne dès 320 px ; la zone de tap déborde de la case jusqu'à
  ~44 px. Le tap sur l'objectif ouvre la **quête** en fenêtre sous la barre,
  calée sur son bord droit (`.hud-quest`, `data-folded`, `toggleQuest` :
  détail, attaque, conseil d'Ève ; elle s'ouvre seule à un nouveau conseil, un
  objectif réussi, la mairie qui faiblit, et se referme au temps ou d'un tap
  sur sa tête).
- Les capsules d'événement (faveur de l'aube, vague, alerte de vivres, météo, combo, « Passer la nuit ») forment **une seule pile** à droite de l'horloge (`ui/eventStack.ts`, `EventStack`, rang par `eventRank`) : la plus pressante devant, puis « +N » qui ouvre le reste en liste (tap, Entrée, Espace, curseur de la manette ; Échap ferme). Le bandeau de la ville garde la place de quatre objets (`--town-item`, `--town-chrome`, verrouillé par `hudTop.test.ts` à 320, 390, 1366, 1460 et 1920 px) et met en tête, en corail, l'eau ou la nourriture à 0. Une infobulle se décale hors de la bulle d'Ève (`dodgeTips`).
- Clavier : ZQSD / WASD (par position) et flèches font marcher Adam
  (`input/keyboard.ts`) ; Espace, flèches, Entrée et Échap tiennent le menu
  de construction (`BuildMenu.handleKey`) ; P, Échap, I, M et ² sont une
  table pure (`input/shortcuts.ts`, testée) que `main.ts` applique. Une
  touche tapée dans un champ (`isTyping`) ou avec Ctrl, Alt, Cmd n'est
  jamais un raccourci — sauf Échap, qui rend la main au jeu.
- **Manette** (PlayStation, Xbox, Steam Deck ; API Gamepad, mapping standard) :
  logique pure dans `input/gamepad.ts` (zone morte radiale `deadZone`, courbe
  du curseur `cursorVelocity`, nouvel appui `PadReader.pressed` — rien au
  premier instantané —, croix répétée, bascule `InputMode`, navigation
  `nearestInDirection`), testée avec une manette simulée ; `navigator` dans
  `input/gamepadDevice.ts` (la dernière manette qui sert, branchement à chaud,
  `vibrationActuator`) ; câblage dans `ui/gamepadControls.ts`, lu à chaque
  frame par la boucle de rendu. Stick gauche : l'axe de marche (le doigt
  passe devant, le clavier derrière) ; stick droit : le **curseur virtuel**
  (`ui/padCursor.ts`), une souris synthétique — `elementFromPoint` puis
  `pointermove` / `pointerdown` / `pointerup` / `click` en `pointerType:
  'mouse'`, `pointerId` `PAD_POINTER_ID` — : canvas, HUD et fenêtres n'en
  savent rien. ✕ / A clique (tenu, glisse), croix : focus voisin parmi les
  éléments que rien ne recouvre (`.pad-focus`, anneau cyan), ○ / B : Échap,
  △ / Y : sac (I), □ / X : « Bâtir » (Espace), L1/R1 et L2/R2 : zoom, R3 :
  revenir sur Adam, Options : pause (P), Share/View : carte (M) — la même
  `runShortcut` que le clavier. Une vraie souris ou un doigt (`isTrusted`)
  masque le curseur ; `data-input="pad"` sur `<html>` cache le joystick
  tactile et montre les étiquettes (`ui/padHints.ts`, △ sur le sac, □ sur
  « Bâtir »). Débranchée en partie : pause et bulle. Pictogrammes des boutons
  dans `art/padGlyphs.ts` ; aide « Contrôles manette » (`ui/padHelp.ts`) et
  section Manette des Réglages (zone morte, vibration ;
  `adam:gamepad`, `storage/localGamepad.ts`). Steam Deck : README.
- `src/ui/icons.ts` sert icônes d'objets, vignettes de bâtiments et
  pictogrammes (`src/art/ui.ts`) en `data:` URL SVG pour le DOM. Le menu de construction est un tiroir derrière un
  seul bouton, « Bâtir » — aucun autre bouton ne porte ce libellé ; armer un bâtiment passe la carte en mode construction
  (piste C, `render/ghostLayer.ts`) : la grille n'existe que là, en pointillés qui s'estompent en
  cercle autour du fantôme ; son emprise se colore case par case (menthe, corail :
  `PlacementBlock.blocked`) dans un contour pointillé ; une bulle sous lui dit le blocage en une
  ligne ; on en sort par « Annuler » ou Échap. Le bouton n'apparaît qu'une fois la mairie
  debout, et le tiroir ne montre que ce qui se bâtit (`World.inMenu`) : ni carte grisée ni
  cadenas, sauf les bâtiments que le chapitre en cours demande et que le labo n'a pas encore
  ouverts — une carte « À découvrir au labo » avec sa recherche (`lockedObjectiveBuildings`),
  au bout de la liste. Un champ de recherche (loupe) en tête du tiroir prend le focus à chaque
  ouverture, vidé, et filtre à la frappe sur le nom, le métier et ce que produit le bâtiment,
  sans casse ni accents (`ui/buildSearch.ts`) ; il ne révèle rien de verrouillé. Entrée choisit
  la première carte, Échap vide puis ferme ; ses touches n'atteignent pas le jeu. Dessous, des
  puces filtrent par famille (`category` de `data/buildings.ts`, `BUILDING_CATEGORIES` : Minerai,
  Production, Attaque, Logistique, Habitat, Recherche ; icônes `data/categoryIcons.ts`,
  logique `ui/buildFilter.ts`) : « Tous », puis les familles qui ont une carte au menu ; la
  famille choisie tient toute la partie, et s'applique avec le texte (« 2 résultats dans
  Tous » si elle n'a rien pour lui). Une colonie neuve (`World.newColony`) n'y propose que `START_BUILDINGS` (`data/buildings.ts` : Maison, Nurserie, Poste de logistique, Labo, Ferme — une colonie sauvegardée sans lui le retrouve au chargement) ; les bâtiments de base attendent la recherche qui les ouvre (`opens`), les autres leur plan, leur recherche ou leur objectif (`World.openBuildings`, sauvegardé ; une sauvegarde d'avant les ouvre tous). Ce qui vient d'y entrer (labo, plan, objectif) porte « Nouveau » jusqu'à ce qu'on
  le choisisse ou le pose (`seeBuilding`, `World.seenBuildings`, sauvegardé) et s'annonce en
  toast (`buildingsUnlocked`).
- La fenêtre d'un bâtiment (`ui/buildingPanel.ts`) laisse voir le jeu : vignette
  et nom en tête, phrase d'ambiance derrière (i), points de vie en une ligne
  (cœur, barre, nombre), ce qui se compte en puces pictogramme + nombre — un
  tap affiche le libellé, aussi en `aria-label` —, le coffre en pictogramme
  au-dessus de ses objets. Sur la carte, un cadre jaune en contour seul
  entoure au sol l'emprise du bâtiment ouvert (`render/selectionLayer.ts`,
  rebond puis respiration) — ou, le même, la silhouette de l'habitant ou de
  l'ennemi ouvert, qu'il suit pas à pas (`render/selectionFrame.ts`), effacé
  s'il rentre chez lui ou meurt ; un tap dans le vide ferme la fenêtre.
- Un bâtiment = une **icône de métier** (`src/data/jobIcons.ts`,
  `Record<BuildingId, string>` : un bâtiment sans icône ne compile pas) — ce
  qu'il fait, pas à quoi il ressemble : hache, pousse, éprouvette… — dans un
  médaillon jaune de la colonie ; `validatePrototypes()` refuse deux icônes
  identiques. Elle est sur la pancarte, épinglée au coin de la vignette du
  menu de construction, et à côté du nom dans la fenêtre du bâtiment.
- Chaque bâtiment fini porte au pied de sa façade une **pancarte** : le
  médaillon de son métier, son nom court (`sign` de `data/buildings.ts`,
  `t().buildings[id].sign`) et, pour une foreuse, son filon (`render/signs.ts`
  décide, `signboard.ts` dessine une texture partagée par type). Les bulles
  d'état (⏸, coffre plein) flottent au-dessus du toit : rien ne se recouvre.
  Médaillon seul et agrandi en reculant, rien sous `SIGN_ZOOM.icon` ; un
  enfant du sprite du bâtiment, dans son emprise (le tap l'ouvre). Réglage
  « Pancartes » (`adam:signs`, `storage/localSigns.ts`).
- Réglage « Compteur de performances » (`adam:perf`,
  `storage/localPerf.ts`, caché par défaut) : une capsule en bas au centre du
  HUD donne FPS, ms par tick de sim et réveils du scheduler par tick
  (`World.wakesLastTick`), moyennés sur `PERF_WINDOW_MS` (`ui/perfMeter.ts`,
  mesure prise par la boucle de `main.ts`). Rien n'est envoyé.
- **Cadence du DOM** (`ui/uiClock.ts`) : la boucle de `main.ts` ne remet le
  HUD et les fenêtres à jour qu'à `UI_HZ` (12 Hz) ; un geste (`poke`) les fait
  suivre chaque frame `UI_LIVE_MS`. Seul ce qui suit la caméra reste à la frame
  (`Hud.frame` : infobulle, bulles d'Ève et d'un habitant, flèche du bandeau).
  Aucune lecture de mise en page dans la boucle : les tailles viennent d'un
  `ResizeObserver` et se relisent en tête de frame, avant toute écriture
  (`Hud.measureLayout`, les insets du bas dans `main.ts`).

## Système de sprites

- **Un sprite = un module de `src/art/`** qui construit son SVG avec les
  helpers de `artDirection.ts`, en **morceaux** (`parts`) du même cadre :
  un corps par direction et un pied pour un personnage ; `site`, `built`,
  `damaged` pour un bâtiment (+ `wheel` pour la foreuse, `crops` pour la
  ferme) ; `full`, `damaged` pour une ressource. Cadre et ancre en pixels
  monde (tuile = 32 px). `src/data/sprites.ts` est le registre ; `art/` est
  soumis à la même frontière que `data/` (ni Pixi ni DOM).
- `src/render/spriteLibrary.ts` rastérise chaque morceau **une fois** au
  chargement, à la résolution de l'écran (`devicePixelRatio`, plafonné à 3),
  dans un atlas (une page de 2048 px de large ; ~100 images tiennent dans
  une texture). Le reste du rendu ne voit que des `Texture`. Le panneau
  `?debug` affiche pages, mégapixels et temps de chargement.
- Animation **par morceaux**, pas par planches : `render/puppet.ts` anime
  Adam, les mutants, les enfants et les ouvriers (pieds qui alternent, rebond, écrasement
  à la frappe, arc qui se tend, grimace au coup reçu, boitillement d'un patient) ; la roue de la foreuse
  tourne, les cultures ondulent ; un mutant mort s'écrase et s'efface ; un
  porteur a sa charge (l'icône de l'objet) sur la tête.
- Les bâtiments sont vus en 3/4 : cadre large comme l'emprise, plus haut
  qu'elle (le toit dépasse), ancré en (0, 1) au pied de l'emprise. Sous la
  moitié de ses points de vie, un bâtiment montre `damaged`.
- Arbres et rochers sont des sprites (`render/resourceLayer.ts`) triés en
  profondeur avec les bâtiments et les personnages : ils montent au-dessus
  de leur tuile, Adam passe derrière. Une ressource peut avoir plusieurs
  sprites (`RESOURCES[id].sprites` : feuillu, sapin, arbre mort), tirés par
  tuile depuis la seed.
- Le sol (`src/art/terrain.ts` : herbe, sable, roche, transitions,
  coins arrondis d'une demi-tuile — une rive en biais fait une vague, pas un
  escalier) et le décor (`src/data/decor.ts`, sprite `decor`, tiré par
  `decorAt()`) sont bakés par blocs de 16 × 16 tuiles (`render/chunkLayer.ts`,
  résolution plafonnée à 2). L'herbe est une **prairie sans damier** (piste A,
  `render/meadow.ts`) : grandes taches claires ou denses aux bords ronds
  (jamais au contact d'un autre sol), brins et fleurettes semés hors de la
  grille, tirés de la seed ; et des chemins de terre battue de la mairie
  bâtie à chaque bâtiment fini, lus dans la ville — le bloc qu'un chemin
  traverse se rebake quand il apparaît ou disparaît.
  Le décor ne se heurte pas et n'est jamais de l'état.
  L'eau n'est pas bakée (sous elle, la terre de sa rive) : un seul shader la
  peint par-dessus (`render/waterLayer.ts`, `waterShader.ts`), d'après un
  champ par bloc (`render/waterField.ts` : niveau lissé, distance à la rive) —
  rive arrondie sans marche, dégradé turquoise → bleu, écume qui respire en
  3 s, crêtes en arc qui naissent et s'effacent ; un maillage par bloc
  d'eau, sur le temps de rendu, figé sous `prefers-reduced-motion`.
- Ombres portées : capsules pleines dans la teinte foncée du sol sous
  l'objet (`TerrainTiles.shadow`), dans un conteneur sous tout le reste.
- Ressenti (rebond, secousse, tremblement, flash, caméra) : des minuteurs
  de vue côté `render/`, jamais de l'état de simulation.
  Le **zoom** du joueur (`Camera.level`, bornes `ZOOM` : 0,6–1,5) se
  pilote aux trois boutons du bord droit (`ui/zoomControls.ts` : avancer,
  revenir sur Adam, reculer ; Pause, Réglages et la carte du monde au-dessus), à la molette sous le curseur et au pinch
  (`input/zoom.ts`, le geste à deux doigts de `PointerDispatch`, qui ne
  prend que des doigts libres ou de tap) ; mémorisé sous
  `adam:zoom` (`storage/localZoom.ts`), jamais dans la partie. Tant que le
  joueur n'a pas zoomé (rien sous `adam:zoom`), la caméra **cadre** la zone
  explorée autour d'Adam (`fitZoom`, `knownSpan`, `Camera.fit`, à chaque
  taille d'écran) : un grand écran avance jusqu'à ce qu'elle le remplisse,
  un téléphone garde le zoom par défaut ; ce cadrage n'est pas mémorisé, et
  « revenir sur Adam » y ramène.
  La **carte du monde** (`ui/worldMap.ts`) s'ouvre au bouton en tête de
  cette colonne ou à la touche M (Échap la ferme) : un canvas 2D plein
  écran, le fond peint par blocs de 16 × 16 tuiles en basse résolution
  (refait à l'ouverture et toutes les 4 s), bâti, habitants et ennemis en
  marqueurs, le cadre de la caméra ; glisser, molette et pinch (`MapView`),
  un tap y pose la caméra (`Camera.lookAt`, jusqu'au prochain pas d'Adam).
  Le jeu tourne derrière, scène masquée. Elle ne montre que ce que
  `MapSight` permet (inexploré / exploré / visible) : le brouillard de
  guerre de la partie (`FogSight`, sur `World.sightAt`).
  `render/indicatorLayer.ts` dessine les repères de bord (mutants, mairie,
  gisement que réclame le conseil — `sim/deposits.ts`), jamais sous le HUD ;
  taper celui de la mairie y jette un coup d'œil (`Camera.peek`).
- L'icône (favicon, PWA) et la bannière du README sont des scènes SVG
  composées avec les sprites (`src/art/brand.ts`) ; `npm run art:brand`
  écrit les pages à rastériser et affiche les commandes Chrome qui
  produisent `public/icon.png`, `public/favicon.png` et `docs/banner.png`.
- Relire un visuel : `npm run art:sheet -- planche.svg`, puis
  `google-chrome --headless --screenshot=planche.png --window-size=L,H planche.svg`
  et ouvrir le PNG avec `Read`.

## Son

Chaque son est un échantillon de `public/audio/sfx/` (`.ogg`, repli `.m4a`) :
jingles acoustiques générés avec Lyria 3, bruitages réels CC0 (sources dans
son `CREDITS.md`). `audio/samples.ts` les charge au premier geste, un par
un, et tient la table des gains et des variantes ; tant qu'un fichier n'est
pas décodé, le son retombe sur sa synthèse Web Audio (`synth.ts`). La
musique de fond, ce sont trois boucles (`public/audio/music/`, crédits dans
son `CREDITS.md` ; Ogg Vorbis puis repli `.m4a` pour Safari ;
`audio/music.ts`) : le thème du jour, préchargé sans retarder l'écran titre ;
la nuit calme et le combat, orchestraux, composés par `npm run music:night`
(`tools/music.ts`, même tempo et même longueur, le combat calé sur la nuit),
téléchargés à la première nuit seulement. `musicState` (`audio/nightMood.ts`)
tire le morceau des moments de la nuit — crépuscule → nuit, vague → combat,
dernière vague tuée → nuit, aube → jour — et le passage est un fondu
enchaîné (`MUSIC_FADE_S`) ; musique allumée, la couche de tension
synthétique se tait. Bouclée par un `AudioBufferSourceNode`, coupée onglet
caché, baissée en pause ; interrupteur « Musique » et deux volumes
(musique, bruitages) dans les réglages (`adam:music`,
`…:music-volume`, `…:sfx-volume`).
Un nouvel effet = une entrée dans `SOUNDS` (`synth.ts`), une dans
`SAMPLES` (`samples.ts`) avec ses fichiers et leur crédit, et une
ligne dans `wireAudio()` (`main.ts`), qui est la seule table événement → son.
Rien ne joue avant un geste du joueur.

## Règles d'architecture

- **`sim/` et `data/` n'importent jamais `pixi.js`, `render/`, `ui/` ni le
  DOM.** Appliqué par ESLint. Les tests tournent headless en Node.
- L'UI ne modifie jamais l'état : elle pousse une commande (`sim/commands.ts`),
  le tick la consomme. Seed + journal de commandes = partie rejouable. Le
  hasard des vagues et des enfants vient du PRNG du monde, jamais de
  `Math.random()` côté `sim/`.
- La carte n'est jamais stockée : terrain, filons et ressources de surface
  sont régénérés depuis la seed (`sim/terrain.ts`). Seules les modifications
  du joueur (`sim/resources.ts`, entités) sont de l'état. Le départ aussi se
  tire de la seed, avec son foyer : bosquet, filon de pierre (≤ 12 tuiles) et
  de fer (≤ 20) à portée de pas d'Adam, chacun avec un bord où poser une
  foreuse — `terrain.test.ts` et `footing.test.ts` le vérifient sur
  1 000 seeds —, une rive où poser le puits dans la prairie, hors des zones
  des bases (sinon la mare du foyer ; `needs.test.ts`, 1 000 seeds), et une clairière qui ouvre sur au moins 400 tuiles (l'eau et
  les rochers ferment, pas les arbres).
- Sauvegarde automatique : `sim/save.ts` sérialise le monde (format versionné
  `{ version, savedAt, state }`, validé à la lecture) ; `storage/localSave.ts`
  est le seul à toucher au `localStorage` (clé `adam:save`), et tout
  y est dans un try/catch. Un nouvel état de simulation doit entrer dans
  `World.snapshot()` / `restore()` — sinon il se perd au rechargement ; un
  changement incompatible incrémente `SAVE_VERSION`.
- **Ancien nom** : les clés de l'appareil sont sous `adam:*`. Au démarrage, `storage/legacyKeys.ts` (`adoptLegacyData`) renomme celles de l'ancien préfixe sans jamais écraser, importe le transfert `#import=…` envoyé par l'ancienne adresse (`client/legacy/`, servie par le second bloc de `client/nginx.conf`) et retire l'ancien service worker ; le serveur renomme sa base (`adoptLegacyDatabase`). Voir `docs/deploiement.md`, section 6.
- **Deux onglets, une partie** : `storage/localTab.ts` (`TabLock`, clé `adam:tab`) donne la main au dernier onglet arrivé ; un onglet dépassé n'écrit plus, saute son rattrapage au retour et affiche `ui/tabLockPanel.ts` (« Reprendre la main » recharge). Un échec d'écriture (`LocalSave.save` à `false`) lève un toast une fois. La sauvegarde de fermeture attend le tick qui consomme un `catchUp` en attente (`Autosave.hold`).
- Le **jardin des souvenirs** (graines laissées par chaque colonie tombée ou refondée après le Signal — « Fonder une nouvelle colonie » de l'écran de victoire verse les graines du bilan, `ColonyScore` : nuits, enfants, bâtiments, bases abattues, habitants, temps, Signal, puis repart sur une carte neuve ;
  bonus plantés, « Partie pure ») n'est pas l'état d'une partie : format
  versionné dans `sim/garden.ts`, clé dédiée `adam:garden`
  (`storage/localGarden.ts`), jamais effacé par « Recommencer ». Les bonus
  sont de la donnée (`src/data/perks.ts`) et entrent dans la partie par la
  commande `applyPerks`, au départ d'une nouvelle colonie seulement.
- Le contenu est de la donnée (`src/data/*.ts`, `as const satisfies`).
  `validatePrototypes()` tourne au démarrage en dev et dans les tests.
- Pas d'ECS, pas de moteur physique. Le multijoueur viendra par le back-end
  (voir Back-end), jamais au prix du jeu hors ligne.
- **Langue** (FR / EN) : tout texte visible passe par `t()` (`src/i18n/locale.ts`).
  Le dictionnaire français (`src/i18n/fr/`) fait foi et reprend les textes
  de `data/` ; l'anglais (`src/i18n/en/`) doit en avoir chaque clé (typecheck,
  `i18n.test.ts` : mêmes clés, aucun mot de français). `sim/` et `data/`
  n'importent jamais `i18n/` : la simulation émet des ids, l'UI traduit. Un
  libellé fixe se réécrit dans un `onLocale` du constructeur ; un cache de
  rendu met la langue dans sa clé. Le choix se fait au menu Réglages (bouton
  engrenage, `ui/settingsPanel.ts` : langue, sons, musique ; il arrête
  l'horloge) et se garde sous `adam:locale`
  (`storage/localLocale.ts`), langue du navigateur au premier lancement.
  Le français est dans le paquet de départ ; l'anglais est un morceau à part
  (`loadLocale`, import dynamique, `registerMessages` pour les tests qui le posent
  d'avance : `i18n/testSetup.ts`) : `setLocale('en')` ne change rien tant qu'il
  n'est pas arrivé.
- **Paquet** (`vite.config.ts`) : PixiJS est un morceau à part (`pixi`, il change
  rarement) ; ce qui n'est pas là au premier écran se charge à la demande par
  `import()` — anglais, fenêtre d'invitation et son QR code (`ui/lazyPanel.ts`),
  écran « Rejoindre », jeu à deux (`net/play.ts`, `net/lockstep.ts`), vocal
  (`net/voice*.ts`), scénarios de test —, et `ui/idleLoad.ts` les tire aux temps
  morts une fois « Jouer » pressé. `precache` du service worker liste tout fichier
  du build : un morceau ajouté est en cache sans rien faire. Un nouveau code
  lourd et rarement ouvert se charge de même. Audio : boucles et bruitages sont
  réencodés à débit modeste (`public/audio/*/CREDITS.md`) ; bruitages en mono.

## Partie de test

**`/adam/test`** — en local `http://localhost:5173/adam/test`,
en ligne https://cardona.digital/adam/test — ouvre directement,
sans écran titre, une petite base déjà bâtie (graine 100, matin du jour 1) :
mairie et son stock, cabane de bûcheron, ferme, puits (au bord de l'eau à l'ouest,
`WELL_SPOT` : en ligne droite de la mairie), deux postes de logistique (l'un entre
la cabane et la ferme, l'autre près du puits, qui vident leurs coffres dans la
mairie ; ouvriers réglés d'emblée par `workers`, la colonie n'en a que dix), poste de construction, et le
chantier du labo à moitié livré (bois complet, pierre en route, fer manquant).
Bandeau « Partie de test » en bas à gauche (le haut reste celui d'une vraie partie). Elle ne lit ni n'écrit aucun stockage
(sauvegarde, jardin, record) et repart à l'identique à chaque rechargement.
Le scénario est de la donnée (`data/testScenario.ts`), rejoué avec les
commandes du jeu par `sim/testScenario.ts` ; `/test/<id>` ouvrira un autre
scénario (`ui/testRoute.ts`). GitHub Pages n'ayant pas de page de repli, le
build copie `index.html` sous chaque route (`vite.config.ts`).

## Joueur simulé

`npm run playtest -- --seeds 50 --minutes 60` (`--strategy afk|both`,
`--json`) : un bot sans rendu (`sim/playtest.ts`) joue chaque graine en
suivant les objectifs — récolter ce que réclame le chantier ou le labo, poser
au plus près de la mairie, lancer la recherche qui ouvre le bâtiment, garder
la mairie la nuit — uniquement par des commandes ; `afk` ne fait plus rien
après la mairie. Rapport par partie (jalons, morts par cause et par nuit,
vagues et PV de la mairie, temps sans rien à faire, nuit de la chute) et
tableau médiane / p10 / p90, un fil par cœur (`tools/playtestPool.ts`).
`sim/playtest.test.ts` en tient les invariants sur cinq graines. Mode
d'emploi : `src/tools/README.md`. C'est la mesure des tickets d'équilibrage.

## Aperçu en direct

`.claude/launch.json` déclare le serveur Vite (`npm run dev`, port 5173) :
dans l'app Claude Code (onglet Code), l'aperçu lance le jeu et le recharge à
chaque modification (HMR). Le jeu est sous `/adam/`, la partie de
test sous `/adam/test`.

## Back-end

**Règle d'or : le jeu reste 100 % jouable hors connexion, sans compte.** Les
sauvegardes restent locales ; le serveur n'ajoute que des fonctions en ligne
(comptes, parties entre amis, à venir). Injoignable ou absent, le jeu démarre
et se joue exactement pareil.

Monorepo léger, workspaces npm : la racine est le client, `server/` le
back-end (`@adam/server`), `shared/` le contrat que les deux
importent (`shared/api.ts` : `API_VERSION`, `API_PATHS`, `HealthResponse`,
messages du WebSocket — ni DOM ni Node, ESLint le garde). Un `npm ci` à la
racine installe tout ; lint, typecheck, tests (`server/src/**/*.test.ts`,
même Vitest) et build couvrent les deux.

- **Node 24 sans build** : Node exécute le TypeScript en effaçant les types
  (`node server/src/main.ts`) — d'où `erasableSyntaxOnly` et les imports en
  `.ts` (`server/tsconfig.json`). Le « build » du serveur est son typecheck.
- **HTTP : Hono** (`server/src/app.ts`, `createApp`) sur `@hono/node-server` ;
  testé par `app.request()`, sans port. CORS par `CORS_ORIGINS`.
- **WebSocket : `ws`**, sur le même port, chemin `/ws`
  (`server/src/socket.ts`) : `hello` à la connexion, `ping` → `pong`,
  heartbeat qui ferme les connexions mortes, origine vérifiée comme le CORS.
  Le jeu à deux s'y branchera.
- **SQLite : `node:sqlite`** (embarqué dans Node, aucun module natif), SQL
  écrit à la main et préparé, pas d'ORM (`server/src/db.ts`). WAL, clés
  étrangères. **Migrations** : `server/migrations/NNNN_nom.sql`, numérotées
  à la suite, jamais modifiées une fois publiées ; chacune dans sa
  transaction, inscrite dans `schema_migrations`, appliquée au démarrage
  (`startServer`) ou par `npm run migrate -w server`. Une base plus récente
  que le code, ou une migration renommée, arrête le démarrage.
- **Routes** : `GET /health` → `{ ok, service, api, schema, uptime }`
  (503 si la base ne répond plus), sonde du jeu et du conteneur.
- **Config** : variables d'environnement seulement (`server/src/config.ts`,
  `loadConfig`), liste dans `server/.env.example` : `PORT` (8790 — 8787 est
  pris par Ponos en local), `HOST`, `DATABASE_PATH`, `CORS_ORIGINS`, `INVITE_TTL_MINUTES`
  (par défaut `localhost` sur tout port). `server/.env` est lu s'il existe
  (`readEnv`), sans écraser l'environnement.
- **Docker** : `server/Dockerfile`, construit depuis la racine
  (`docker build -f server/Dockerfile .`) : `node:24-alpine`, dépendances du
  serveur seules, base dans le volume `/data`, `HEALTHCHECK` sur `/health`,
  utilisateur `node`, arrêt propre sur SIGTERM.

**Côté client** (`src/net/`) — `api.ts` : l'URL du serveur est fixée au
build (`VITE_API_URL`, `.env.example` ; `apiBaseUrl`), `probeHealth`
(délai `PROBE_TIMEOUT_MS`, jamais d'exception ; une autre version de
l'API ou un autre service = hors ligne), `socketUrl`. `connection.ts` :
`Connection` tient l'état `online` / `offline` (hors ligne par défaut,
`subscribe`), sonde au démarrage sans le retarder, puis chaque minute en
ligne, de plus en plus rarement hors ligne (`OFFLINE_BACKOFF_MS`, jusqu'à
5 min) ; rien onglet caché ni sans réseau (`navigator.onLine`), resonde à
leur retour. `main.ts` la crée et la démarre ; en dev, elle est sous
`window.adam.connection`. **Sans `VITE_API_URL` (le build de
GitHub Pages, `npm run dev`), aucune requête n'est faite.** Avec une URL et
le serveur coupé, le navigateur inscrit lui-même l'échec de la sonde dans la
console (aucun script ne peut l'en empêcher) : le backoff en limite le
nombre, le jeu n'en voit rien.

**Comptes** (facultatifs ; `shared/api.ts` : routes `/auth/register|login|logout|me`,
bornes `ACCOUNT_LIMITS`, validation partagée client/serveur ; `server/src/accounts.ts`,
`passwords.ts`, `rateLimit.ts`, migration `0002_accounts.sql`) — pseudo, e-mail
(unique, minuscules), mot de passe haché en **Argon2id** (`node:crypto`, jamais
journalisé). Session : **jeton opaque en `Authorization: Bearer`**, pas de cookie
— le jeu (Pages) et le serveur sont sur deux origines, et un cookie tiers est
refusé par Safari et les navigateurs mobiles ; le serveur n'en garde que
l'empreinte SHA-256, 90 jours. Limites de tentatives en mémoire (5 échecs par
adresse, 20 par IP, 15 min ; 10 inscriptions par IP et heure), IP lue dans
`X-Forwarded-For` derrière le proxy. Client : `net/account.ts` (`AccountClient`,
jamais d'exception, hors ligne = `offline`), session gardée sous
`adam:account` (`storage/localAccount.ts`, jamais dans la partie),
fenêtre `ui/accountPanel.ts` (boutons « Compte » de l'écran titre et des
Réglages, Échap la ferme la première), textes `i18n/*/account.ts`. Sans
serveur ou sans `VITE_API_URL`, le bouton dit « hors ligne » et rien d'autre
ne change. Captures dans `docs/comptes/`.

**Parties hébergées** (facultatif ; `shared/api.ts` : `/parties`, `PARTY_LIMITS`,
`cleanPartyCode` ; `server/src/parties.ts`, migration `0003_parties.sql`) — un
joueur héberge sa partie (« Inviter un ami » : le premier disque de `.hud-zoom`,
`Hud.inviteButton`, posé seulement avec un serveur, ou la pause ;
`ui/invitePanel.ts`). **Aucun compte n'est exigé** : sans compte, l'hôte comme
l'ami n'entrent qu'un pseudo (`ui/nicknameField.ts`, `PartyClient.hostAs` /
`joinAs`) et le serveur leur ouvre une session d'**invité** (`POST /auth/guest`,
migration `0004_guests.sql` : compte `guest`, adresse tirée au hasard, sans
hachage — personne ne s'y connecte ; `GUEST_MAX_PER_IP`), gardée sous
`adam:account` comme une autre ; « J'ai un compte » ouvre la fenêtre Compte.
La fenêtre dit « En attente de votre ami… » puis « Lina a rejoint la partie » ;
l'ami entré (`guestIn`), elle se retire après `WELCOME_MS` et la partie reprend
si l'hôte invitait depuis la pause : le serveur ouvre une session avec un **code de 8
caractères** (`PARTY_ALPHABET`, sans I L O 0 1, tiré de `randomBytes`), qui
expire après `INVITE_TTL_MINUTES` (60 par défaut, `ServerConfig.inviteTtlMs`) ou
quand l'hôte la ferme (`DELETE /parties/:code`) ; une seule invitation ouverte par
hôte, un seul ami (`maxGuests`). Chercher des codes inconnus est limité par IP
(429). Le lien est `…/adam/?join=CODE` (`net/invite.ts` : un paramètre,
GitHub Pages n'a pas de page de repli), son QR code un SVG de la palette
(`ui/qrCode.ts`, `qrcode-generator`) ; partage natif (`navigator.share`) ou copie.
L'ami arrive sur `ui/joinPanel.ts` (« Rejoindre la partie de <pseudo> ») : un
pseudo et « Rejoindre » le mettent dans la salle d'attente, que l'hôte et lui
relisent toutes les 3 s (`POLL_MS`). Lien expiré, fermé, invalide ou partie pleine :
message clair et « Retour à l'écran titre ». Une fois dans la salle, l'ami entre
dans la partie (`?play=CODE`, voir Jouer à deux). Captures dans `docs/partie/`.

**Jouer à deux** (`net/lockstep.ts`, `net/play.ts`, `sim/partner.ts`,
`server/src/rooms.ts`) — la partie tourne chez l'hôte, qui fait autorité ; le
serveur ne simule rien, il vérifie qui entre (jeton + code, l'ami doit être dans
la salle) et relaie (`relay`). La simulation étant déterministe, l'ami **rejoue**
la partie au tick près : à son arrivée, l'image (`key`, le `snapshot()` de la
sauvegarde, compressé par `permessage-deflate`) ; puis les pas (`f` : une plage
de ticks, les commandes de chacun avec leur tick, l'empreinte `World.checksum`
une fois par seconde), dix paquets par seconde. Ses commandes partent à l'hôte
(`World.relay`), qui les valide (`parsePartnerCommand`, `PARTNER_COMMANDS` : ni
l'arc d'Adam, ni sa garde-robe, ni les réglages de l'hôte) et les applique
enveloppées (`asPartner`) ; l'ami ne les voit qu'en retour, quelques ticks
derrière l'hôte (`LOCKSTEP.bufferTicks`, rattrapage accéléré). Empreinte
différente → la page se rouvre sur une image neuve (`resync`, trois fois au plus).
L'ami est un second joueur de la simulation (`World.partner`, sauvegardé avec
la partie de l'hôte, retiré au chargement en solo) : gabarit d'Adam habillé
autrement (`PARTNER_LOOK`, sprite `partner`), pseudo dans une capsule blanche ;
il récolte, heurte, bâtit, échange comme Adam, ne tire pas et n'est pas visé.
`World.player` est le joueur de l'écran hors du tick (`viewAsPartner`) et celui
qui agit pendant ; `World.adam` est toujours Adam ; `World.mine` n'écoute que
les événements du joueur de l'écran. Déconnecté, son personnage s'arrête, puis
part après `graceMs` (son sac reste au sol) ; il revient tant que la session est
ouverte. L'hôte parti : l'ami le voit (`PlayScreen`) et revient à l'écran titre —
sa propre partie intacte, rien de celle de l'hôte n'est sauvegardé chez lui. Un
joueur invité au plus ; l'hôte en pause ou onglet caché, la partie s'arrête pour
les deux. GIF dans `docs/partie/deux-joueurs.gif` et, sans compte,
`docs/partie/invitation-sans-compte.gif`.

**Vocal** (`net/voice.ts`, `net/voiceBrowser.ts`, `net/iceServers.ts`,
`ui/voicePanel.ts`, `i18n/*/voice.ts`) — dans une partie à deux seulement : ni
solo ni build hors ligne n'en ont (pas de session, pas de `VoiceChat`, le micro
n'est jamais demandé). WebRTC de navigateur à navigateur, **aucun son par le
serveur** : il ne passe que la signalisation (`voice` de `ClientMessage` /
`ServerMessage`, `PartyRooms.signal`, aux seuls membres de la salle, jamais à
l'expéditeur, avec l'id et le pseudo de qui l'envoie ; budget par seconde à part,
`VOICE_LIMITS`, pour ne jamais gêner les pas de la partie). Maillage : un
arrivant dit `join`, ceux qui y sont répondent `here`, et l'id de compte le plus
petit envoie l'offre (`VoiceChat`, pure, testée avec des faux `VoiceEnv`).
Désactivé par défaut ; le **premier clic** sur « Rejoindre le vocal » demande le
micro (écho, bruit et gain réglés). Dans le vocal : micro coupé / ouvert (V,
L3 à la manette), quitter, volume global des autres, un indicateur « parle » par
joueur (niveau `VOICE.speakingLevel`) ; la session (`HostSession.voice`,
`GuestSession.voice`) le ferme en s'arrêtant. Un seul bouton HUD (`.hud-voice`)
prend la place de « Inviter un ami » quand l'ami est là — pas de disque de plus
en portrait —, et la pause a « Rejoindre / Quitter le vocal ». STUN public ; TURN
facultatif au build (`VITE_TURN_*`, `docs/deploiement.md`, « Vocal »). La page de
l'ami se rouvre sur un recalage : le vocal se rejoint alors d'un clic.

**Scripts** : `npm run dev:all` lance serveur (`dev:server`, `node --watch`)
et client branché dessus (`dev:online` = `vite --mode online`, qui lit
`.env.online` → `http://localhost:8790`) ; `npm run dev` reste le jeu seul,
hors ligne. La base de dev est `server/data/` (ignorée par git).

## Vérifier avant de pousser

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` est le projet Vitest **`fast`** (`vitest.config.ts`), à lancer avant
chaque commit : moins de 40 s. Il saute les `*.slow.test.ts` (courbes de
défense `defense.slow.test.ts`, longue partie `longRun.slow.test.ts`) et les
longues parties marquées `it.skipIf(!SLOW)` (`SLOW`, `sim/sweep.ts`), et réduit
les balayages de graines à 200 (`SWEEP_SEEDS`, même fichier). Un nouveau
balayage lit `SWEEP_SEEDS`, une partie de plus de 3 s `SLOW`. Les tests de
`ui/` qui touchent au DOM sont des `*.dom.test.ts` (`// @vitest-environment
happy-dom`).

`npm run test:slow` est le projet **`slow`** : la suite entière, balayages à
1 000 graines. Il tourne en CI (job `slow`) et avant une release, en local sur
demande. `npm run test:e2e` (Playwright, `playwright.config.ts`, `e2e/`) construit
le jeu et le lance dans Chromium headless à 390 × 844 et 1440 × 900 : titre,
« Jouer », pas au clavier, pause, aucun bloc du HUD hors de l'écran, aucun
`[hidden]` visible, aucune erreur console. Première fois :
`npx playwright install chromium`. CI : job `e2e`.

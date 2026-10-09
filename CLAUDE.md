# Mobile Factory — contexte du projet

Ce fichier est lu au début de chaque session. Il dit ce qui ne doit pas se
perdre d'une session à l'autre : le pitch, la direction artistique, et les
règles d'architecture. Le détail est dans les fichiers qu'il désigne — les
lire avant de toucher au domaine concerné.

## Le jeu

Jeu d'usine 2D pour navigateur mobile (TypeScript, PixiJS v8, Vite).

**Pitch** — `src/data/lore.ts` fait foi. Un futur apocalyptique, quelques
survivants. Le héros est **Adam** ; **Ève** le rejoindra ; des **humains
mutants radioactifs** rôdent. La partie commence sur le chantier de la
**mairie**, qu'Adam doit remplir de bois et de pierre.

**Mécanique centrale** — Adam n'a pas de bouton d'action. Il récolte **de
proximité** : toutes les 10 ticks, les arbres et rochers à portée (quatre au
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
Tant que la mairie n'est pas debout, Adam ne récolte d'un objet que ce
qu'on en attend (`World.wanted` : chantiers, recettes) plus une réserve
(`SPARE_CARRY`) ; au-delà, il n'en prend plus (`harvestRefused`,
signalé). Ensuite la ville prend tout, sauf ce dont elle a déjà assez
(`TOWN_PLENTY`, `data/items.ts`) : cet objet-là, il n'en ramasse plus en
passant que pour un chantier ou une recette. Le conseil ne dit de livrer que si le sac contient ce qu'on attend.

**Routes** — la pierre en trop devient des chemins (`data/roads.ts`,
`sim/roads.ts` : un ensemble de tuiles par chunk, sauvegardé). Carte
« Route » au bas du tiroir : on glisse le doigt de tuile en tuile (40 au
plus), « Poser » pave, une pierre par tuile, sac puis ville dans son rayon,
sans chantier (`paveRoad`, jugé par `World.roadPlan`). Adam, porteurs,
bûcherons et bâtisseurs y vont 1,6 fois plus vite (`onRoad`, lu par
`walkToward` et le pas d'Adam) ; mutants et bêtes, non. « Retirer » (le
marteau, `removeRoad`) rend la pierre ; une route bloque la pose d'un
bâtiment (refus `road`). Ni eau, ni terre polluée ou radioactive
(refus `terrain`, `polluted`, `radioactive`, cases en corail au tracé). Dalles raccordées (`art/road.ts`, seize masques)
bakées avec le sol : un pavage rebake le bloc.

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
« libres/total ». Ceux de la maison sont des **porteurs** (mobile
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
pousse par case d'herbe nue — ni eau, ni bâti, ni route, ni filon
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
la pose d'un bâtiment ou d'une route comme une pousse. Sans ferme qui couvre
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
(`nameOf`, jamais stocké). L'enfant sort de la nurserie à 10 ans et n'est
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
et la reprend. Sans de quoi, sous `weakBelow` il va à mi-allure, à zéro il
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
bougent pas. Un puits d'une ancienne sauvegarde, loin de l'eau, tourne toujours. 
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

**Menace** — la nuit, des **mutants** sortent des bases mutantes : une
vague par nuit (`WAVES`, `src/data/enemies.ts`), à sa tombée, faite des
assaillants que chaque base a produits le jour (voir Bases mutantes) ; rien
n'apparaît ailleurs, et sans base debout la nuit est calme. Ils marchent
droit sur la cible de leur vague (`Mutant.target`, sauvegardée) : une fois
sur deux, pour chaque base, le bâtiment de l'usine fini le plus proche
d'elle (`WAVES.targets` : foreuse, ferme,
carrière, cabane, forge), sinon la mairie, qui reprend la main si la cible
tombe ; ils traversent tout sauf le bâti, qu'ils cassent. Un bâtiment de
l'usine abattu redevient son chantier, à moitié livré (`RUIN`). Une vague
s'annonce trois secondes avant (bandeau avec son effectif, ses bases, la direction de la plus proche — `World.leadBase` — et sa cible, cor grave, léger recul de caméra vers elle —
pas si un bâtiment est armé ou une fenêtre ouverte, et un tap n'ouvre rien
pendant que la carte glisse),
sort de chaque base par sa porte, l'un après l'autre (`RAIDS.exitStagger`), d'une flaque vert fluo — un mutant qui émerge
(`WAVES.emergeTicks`) n'est pas visable — et finit sur « Nuit N — vague repoussée ! » ;
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
— Bâtiments, Ouvriers, Personnage (`theme`) — dont chaque recherche dit son
icône (`icon`), son effet ou ce qu'elle débloque, son coût, sa durée, son
état (verrouillée : le prérequis nommé) et « Lancer ».

**Objectifs** — la partie est une chaîne d'objectifs en données
(`src/data/objectives.ts`, jugés par `src/sim/objectives.ts`) : mairie,
3 nuits (Ève arrive), les demandes d'Ève (ses quêtes), foreuse et 20 fer,
premier enfant, 5 nuits de plus → « Acte I terminé » (`banner`), puis
l'**Antenne** → victoire « Le Signal », puis la partie sans fin.

**L'Antenne** (`antenna`, kind `antenna`, unique, 3 × 3) — débloquée par
l'objectif 7 (`unlockObjective`), posée à 8 cases au moins de la mairie,
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
Le panneau du haut affiche toujours l'objectif courant (la quête d'Ève en
cours dessous) ; le conseil d'Ève retombe sur celui de l'objectif. Chaque
objectif réussi a sa célébration (son, pluie de feuilles, bandeau) et une
récompense concrète (objets, places de sac, réparation de la mairie). Ce
qui est fait en avance compte ; les nuits à « tenir » se comptent depuis
le début de l'objectif. Une condition qui n'attend qu'une horloge (naissance,
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
partie : clé `mobile-factory:collection` (`storage/localCollection.ts`), jamais
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
encore trouvés, sur les cases explorées. Les rencontres (voyageur, animal rare)
ne sont pas faites.


**Bases mutantes** (`src/data/enemyBases.ts`, `src/sim/enemyBases.ts`) —
à la création de la partie, des anneaux de campements (`ENEMY_BASE_RINGS` :
34, 54, 76 tuiles de la mairie, niveaux 1 à 3) se tirent de la seed, sans
PRNG du monde, sur des emprises libres ; la clairière (22 tuiles au moins)
reste à bâtir. Une base debout tient une zone (`zoneRadius`, disque fluo
pâle au sol, `render/enemyBaseLayer.ts`) : ni chantier (refus
`enemyZone`), ni route, ni récolte d'Adam ou des bûcherons
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
`render/fogLayer.ts`) et inconstructible (refus `region`, bâtiment et route).
Son **gardien** — Grand loup, Crabe géant, Colosse des carrières, Roi des
boues : une bête de `WILDLIFE` à l'habitat `region`, la bête d'origine en plus
grand (`scale`) — veille sur son repaire (`Region.lair`) et ne se montre
qu'une fois l'**ère** de l'anneau atteinte (`ERAS` : Fondation dès le départ,
Colonie après 2 objectifs, Signal après l'acte I ; `World.era()`,
`regionState` : `conquered` / `open` / `locked`). Plus loin, plus coriace
(`hpScale`, `damageScale`). Abattu (`World.conquer`, événement
`regionConquered`), la région est conquise : Prestige, XP, et sa
**spécialité** au sol (ambre, nacre, quartz, spore violette), qu'Adam déniche
aussi en récoltant dans les régions conquises du biome (`findChance`, tirage
haché) et que le labo emploie (quatre recherches). Une colonie neuve
(`newColony`) ne tient que la prairie ; un `new World` les tient toutes.
Sauvegardé sous `regions` (conquises, vie des gardiens blessés) ; une
sauvegarde d'avant tient pour conquises la prairie et les régions où se tient
du bâti ou une route. La carte du monde hachure de jaune les régions à
conquérir (repaire en point corail), voile les verrouillées, borde chaque
région d'un liseré, et sa légende le rappelle. Partie de test `/test/regions`.

**Brouillard de guerre** (`data/fog.ts`, `sim/fog.ts`, `render/fogLayer.ts`)
— trois états par case, comme Age of Empires : inexplorée (indigo plein),
explorée hors de vue (voile indigo, capture figée), visible. Sources de
vision, en disques qui s'additionnent (`FOG_VISION`) : Adam (7), les
habitants dehors (3), chaque bâtiment, chantier compris (3 depuis le bord de
son emprise), la tour de guet finie (13). Calcul incrémental : un compteur
par case, une source ne repeint que si elle change de tuile
(`World.watchSight`, en fin de tick) ; le rendu est une texture d'un texel
par tuile, adoucie et agrandie, refaite à chaque `FogOfWar.revision`. La
capture est en copie sur écriture : une ressource qui change hors de vue
range son état d'avant (`ResourceIndex.watch`, `World.lookAt`) ; une base
mutante sortie de la vue est copiée (`World.knownEnemyBases`) — jamais vue,
elle ne se montre ni ne se tape. Ennemis, bêtes, flèches, butin, caravane ne
se montrent ni ne se tapent hors des cases vues (`World.sees`), leurs repères
de bord et halos non plus. On ne bâtit ni ne pave sur l'inexploré (refus
`unexplored`). Sauvegardés : cases explorées (plages par chunk) et captures,
sous `fog` ; une sauvegarde d'avant explore `FOG_VISION.legacy` autour du
bâti et d'Adam. Débogage : `?nofog` en dev, ou F panneau `?debug` ouvert
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
« ça manque »), vague annoncée (`waveCountdown`, une fois par vague). Sans
serveur ni Web Push : la partie s'arrête onglet caché et rien n'arrive page
fermée, donc rien à notifier tant que le jeu n'a pas de temps hors ligne.
Réglages (section Notifications, cachée si l'API manque) : un interrupteur par
type et un plafond par jour (1, 3, 5, 10 ; `Notifier.cycleLimit`), gardés sur
l'appareil (`mobile-factory:notifications`, jamais dans la partie). La
permission n'est jamais demandée au lancement : `NotificationPrompt` explique
d'abord, après la première recherche lancée (une fois, `explained`) ou depuis
les réglages ; il arrête l'horloge. Android n'accepte que les notifications d'un
service worker : `sw.js` les pose et ramène le jeu au premier plan au tap.
iOS : seulement dans une PWA ajoutée à l'écran d'accueil (16.4+), et jamais
sans que la page tourne.

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
  simulation ne tourne qu'après « Jouer » et hors pause. Police arrondie :
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
  disques en haut à droite (`.hud-zoom`, dernière rangée de la grille de `.hud-top`) ; le bord droit n'a plus de colonne. Tous les boutons du HUD prennent
  `--btn` (48 px, 44 px sous 400 px de large) et `--btn-icon`, posés sur `.hud`. **Une seule variable de hauteur, `--hud-h`**, posée sur `.hud-top` et
  ajustée par paliers (34, 36, 38, 42 px ; 38 sur un téléphone couché) : la
  barre et chaque bloc des deux groupes la prennent, sans marge ni `top` ni
  hauteur à eux ; chaque bloc est sa propre carte blanche, aux rayons de la
  barre (`--hud-r`), sans cadre qui englobe un groupe. Tout tient sur une ligne
  dès 1366 px (la barre 420 px au plus, le groupe de gauche `--hud-side`,
  520 px, la droite à sa taille) ; en
  dessous, la barre reste seule en haut et les deux groupes font une seconde
  rangée juste dessous, de même hauteur. `src/ui/hudTop.test.ts` verrouille ces
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
- Clavier : ZQSD / WASD (par position) et flèches font marcher Adam
  (`input/keyboard.ts`) ; Espace, flèches, Entrée et Échap tiennent le menu
  de construction (`BuildMenu.handleKey`) ; P, Échap, I, M et ² sont une
  table pure (`input/shortcuts.ts`, testée) que `main.ts` applique. Une
  touche tapée dans un champ (`isTyping`) ou avec Ctrl, Alt, Cmd n'est
  jamais un raccourci — sauf Échap, qui rend la main au jeu.
- `src/ui/icons.ts` sert icônes d'objets, vignettes de bâtiments et
  pictogrammes (`src/art/ui.ts`) en `data:` URL SVG pour le DOM. Le menu de construction est un tiroir derrière un
  seul bouton, « Bâtir » — aucun autre bouton ne porte ce libellé ; armer un bâtiment passe la carte en mode construction
  (piste C, `render/ghostLayer.ts`) : la grille n'existe que là, en pointillés qui s'estompent en
  cercle autour du fantôme ; son emprise se colore case par case (menthe, corail :
  `PlacementBlock.blocked`) dans un contour pointillé ; une bulle sous lui dit le blocage en une
  ligne ; on en sort par « Annuler » ou Échap. Le bouton n'apparaît qu'une fois la mairie
  debout, et le tiroir ne montre que ce qui se bâtit (`World.inMenu`) : ni carte grisée ni
  cadenas. Un champ de recherche (loupe) en tête du tiroir prend le focus à chaque
  ouverture, vidé, et filtre à la frappe sur le nom, le métier et ce que produit le bâtiment,
  sans casse ni accents (`ui/buildSearch.ts`) ; il ne révèle rien de verrouillé. Entrée choisit
  la première carte, Échap vide puis ferme ; ses touches n'atteignent pas le jeu. Dessous, des
  puces filtrent par famille (`category` de `data/buildings.ts`, `BUILDING_CATEGORIES` : Minerai,
  Production, Attaque, Logistique, Habitat, Recherche ; icônes `data/categoryIcons.ts`,
  logique `ui/buildFilter.ts`) : « Tous », puis les familles qui ont une carte au menu ; la
  famille choisie tient toute la partie, et s'applique avec le texte (« 2 résultats dans
  Tous » si elle n'a rien pour lui). Une colonie neuve (`World.newColony`) n'y propose que `START_BUILDINGS` (`data/buildings.ts` : Maison, Nurserie, Poste de logistique, Labo — une colonie sauvegardée sans lui le retrouve au chargement) ; les bâtiments de base attendent la recherche qui les ouvre (`opens`), les autres leur plan, leur recherche ou leur objectif (`World.openBuildings`, sauvegardé ; une sauvegarde d'avant les ouvre tous). Ce qui vient d'y entrer (labo, plan, objectif) porte « Nouveau » jusqu'à ce qu'on
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
  « Pancartes » (`mobile-factory:signs`, `storage/localSigns.ts`).

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
  grille, tirés de la seed. Aucun chemin n'est tracé seul entre les
  bâtiments : les seules routes sont celles que le joueur pave.
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
  `mobile-factory:zoom` (`storage/localZoom.ts`), jamais dans la partie.
  La **carte du monde** (`ui/worldMap.ts`) s'ouvre au bouton en tête de
  cette colonne ou à la touche M (Échap la ferme) : un canvas 2D plein
  écran, le fond peint par blocs de 16 × 16 tuiles en basse résolution
  (refait à l'ouverture et toutes les 4 s), bâti, habitants et ennemis en
  marqueurs, le cadre de la caméra ; glisser, molette et pinch (`MapView`),
  un tap y pose la caméra (`Camera.lookAt`, jusqu'au prochain pas d'Adam).
  Le jeu tourne derrière, scène masquée. Elle ne montre que ce que
  `MapSight` permet (inexploré / exploré / visible) — pour l'instant la zone
  que la caméra a montrée (`SeenArea`, pas sauvegardée).
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
la nuit calme et le combat, composés par `npm run music:night`
(`tools/music.ts`, même tempo et même longueur, le combat calé sur la nuit),
téléchargés à la première nuit seulement. `musicState` (`audio/nightMood.ts`)
tire le morceau des moments de la nuit — crépuscule → nuit, vague → combat,
dernière vague tuée → nuit, aube → jour — et le passage est un fondu
enchaîné (`MUSIC_FADE_S`) ; musique allumée, la couche de tension
synthétique se tait. Bouclée par un `AudioBufferSourceNode`, coupée onglet
caché, baissée en pause ; interrupteur « Musique » et deux volumes
(musique, bruitages) dans les réglages (`mobile-factory:music`,
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
  1 000 seeds — et une clairière qui ouvre sur au moins 400 tuiles (l'eau et
  les rochers ferment, pas les arbres).
- Sauvegarde automatique : `sim/save.ts` sérialise le monde (format versionné
  `{ version, savedAt, state }`, validé à la lecture) ; `storage/localSave.ts`
  est le seul à toucher au `localStorage` (clé `mobile-factory:save`), et tout
  y est dans un try/catch. Un nouvel état de simulation doit entrer dans
  `World.snapshot()` / `restore()` — sinon il se perd au rechargement ; un
  changement incompatible incrémente `SAVE_VERSION`.
- Le **jardin des souvenirs** (graines laissées par chaque colonie tombée ou refondée après le Signal — « Fonder une nouvelle colonie » de l'écran de victoire verse les graines du bilan, `ColonyScore` : nuits, enfants, bâtiments, bases abattues, habitants, temps, Signal, puis repart sur une carte neuve ;
  bonus plantés, « Partie pure ») n'est pas l'état d'une partie : format
  versionné dans `sim/garden.ts`, clé dédiée `mobile-factory:garden`
  (`storage/localGarden.ts`), jamais effacé par « Recommencer ». Les bonus
  sont de la donnée (`src/data/perks.ts`) et entrent dans la partie par la
  commande `applyPerks`, au départ d'une nouvelle colonie seulement.
- Le contenu est de la donnée (`src/data/*.ts`, `as const satisfies`).
  `validatePrototypes()` tourne au démarrage en dev et dans les tests.
- Pas d'ECS, pas de moteur physique, pas de multijoueur.
- **Langue** (FR / EN) : tout texte visible passe par `t()` (`src/i18n/locale.ts`).
  Le dictionnaire français (`src/i18n/fr/`) fait foi et reprend les textes
  de `data/` ; l'anglais (`src/i18n/en/`) doit en avoir chaque clé (typecheck,
  `i18n.test.ts` : mêmes clés, aucun mot de français). `sim/` et `data/`
  n'importent jamais `i18n/` : la simulation émet des ids, l'UI traduit. Un
  libellé fixe se réécrit dans un `onLocale` du constructeur ; un cache de
  rendu met la langue dans sa clé. Le choix se fait au menu Réglages (bouton
  engrenage, `ui/settingsPanel.ts` : langue, sons, musique ; il arrête
  l'horloge) et se garde sous `mobile-factory:locale`
  (`storage/localLocale.ts`), langue du navigateur au premier lancement.

## Partie de test

**`/mobile-factory/test`** — en local `http://localhost:5173/mobile-factory/test`,
en ligne https://cardona.digital/mobile-factory/test — ouvre directement,
sans écran titre, une petite base déjà bâtie (graine 100, matin du jour 1) :
mairie et son stock, cabane de bûcheron, ferme, puits, poste de construction, et le
chantier du labo à moitié livré (bois complet, pierre en route, fer manquant).
Bandeau « Partie de test » en bas à gauche (le haut reste celui d'une vraie partie). Elle ne lit ni n'écrit aucun stockage
(sauvegarde, jardin, record) et repart à l'identique à chaque rechargement.
Le scénario est de la donnée (`data/testScenario.ts`), rejoué avec les
commandes du jeu par `sim/testScenario.ts` ; `/test/<id>` ouvrira un autre
scénario (`ui/testRoute.ts`). GitHub Pages n'ayant pas de page de repli, le
build copie `index.html` sous chaque route (`vite.config.ts`).

## Aperçu en direct

`.claude/launch.json` déclare le serveur Vite (`npm run dev`, port 5173) :
dans l'app Claude Code (onglet Code), l'aperçu lance le jeu et le recharge à
chaque modification (HMR). Le jeu est sous `/mobile-factory/`, la partie de
test sous `/mobile-factory/test`.

## Vérifier avant de pousser

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

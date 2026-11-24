# RechargeTN 🇹🇳 — Forfaits mobiles • Tunisie

**Réplique exportable du site RechargeTN original** (l'artefact Muse
`recharge-mobile-tunisie`, v1) — **site séparé, à côté de TuniRecharge**.
Ne pas confondre avec `~/workspace/recharge-tn/` (TuniRecharge, déjà déployé
sur Render) : ce dossier est un **deuxième site indépendant**, avec son propre
nom, sa propre base (`rechargetn.db`), son propre dépôt GitHub et son propre
service Render. Ne jamais déployer ce code sur le service Render
`recharge-mobile-tn` existant.

## 🎨 Style — identique à la capture originale

Fond clair `#F5F7FB`, cartes blanches arrondies, header blanc avec logo
**R jaune** et « Recharge**TN** », nav en haut à droite **Boutique** /
**Mon compte** / **Admin** (comme l'original — pas de « Solde » dans le
header, le solde s'affiche dans la page Mon compte). Barre de filtres **Tous / Tunisie
Télécom / Ooredoo / Orange**, tri **Prix croissant** par défaut, recherche
« Rechercher (ex : 25 Go, Flexi...) ».

Chaque carte forfait (comme sur la capture) :
- data en très grand (« 1000 Go »), badge opérateur carré (**TT** bleu,
  **OO** rouge, **OR** orange) en haut à droite,
- nom du forfait en gris, pastilles « 12 mois » et « 0.500 DT / Go »,
- bonus en vert (« Idéal clé / box mobile », « 120 min d'appels +
  Starzplay inclus », « Renouvelable automatiquement chaque jour »),
- séparateur pointillé, **prix en grand couleur opérateur** (« 500 DT »),
- bouton **Recharger** couleur opérateur,
- badge jaune **Populaire** sur les 3 forfaits 25 Go.

## ✨ Fonctionnalités (même moteur que TuniRecharge)

| Fonction | Détail |
|---|---|
| Recharge rapide (modale Recharger) | Forfait → numéro tunisien (8 chiffres, 2 / 5 / 9) → paiement → statut `Pending / Processing / Completed / Cancelled` + reçu + lien WhatsApp |
| **Comptes clients avec confirmation admin** | Inscription par **numéro de téléphone uniquement** (nom + téléphone 8 chiffres + mot de passe 6 caractères minimum, **sans email** — comme l'original) → statut **Pending**. Le client **ne peut pas se connecter** tant que l'admin n'a pas cliqué **Approuver**. L'admin peut aussi **Refuser**. Connexion par **numéro de téléphone + mot de passe** (bouton jaune « Se connecter »), onglets **Connexion / Nouveau compte** sur la page **Mon compte** (vraie page sur fond clair, pas une fenêtre sur une page grise vide). |
| **Solde / Wallet client** | Solde en DT, affiché dans la page **Mon compte**. L'admin **crédite / débite** le solde (montant + motif obligatoire, historique complet). Le client peut **payer avec son solde**, demander une recharge de solde (D17/Flouci → l'admin confirme → solde crédité). Annulation d'une commande payée par solde = **remboursement automatique**. |
| Dashboard client | Solde, mes recharges (répéter), historique solde, favoris, notifications |
| Dashboard admin | Stats, comptes en attente, soldes à valider, commandes, clients & soldes, forfaits (prix / bonus / validité / badge), codes promo, paramètres (WhatsApp, D17, Flouci) |
| Recherche & filtres | Recherche texte, filtre opérateur, tri prix croissant / décroissant / plus de data / plus vendus, **comparateur** (jusqu'à 4 forfaits) |
| Codes promo | `BIENVENUE10` (−10 %, max 5 DT), `RECHARGETN5` (−5 %, max 3 DT) |
| Recharge programmée | Date/heure future → commande au statut `Scheduled` |
| Suivi public | Suivi d'une commande par son code (`TR-XXXXXX`), sans compte |
| FR / AR | Bascule français ⇄ arabe (RTL) |

## 📱 Catalogue — 33 forfaits, exactement ceux de l'original

Source : catalogue lu dans l'artefact original (`listforfaits`, 24 nov. 2026).
**Aucun forfait Crédit** dans l'original — les cartes « 100 DT » / « 250 DT »
en haut de la capture sont les Flexi 200 Go (100 DT) et Flexi 500 Go (250 DT).

- **Tunisie Télécom — 9** : Pass 100 Mo 0,45 DT (jusqu'à minuit), 650 Mo 3 DT (7 j), 1.5 Go 6 DT, 4 Go 10 DT, **25 Go 30 DT (Populaire)**, 45 Go 50 DT, 60 Go 60 DT, 110 Go 80 DT, 200 Go 100 DT
- **Ooredoo — 15** : Flexi Micro 50 Mo 0,25 DT (2 heures), Flexi 1j Mini 100 Mo 0,5 DT, Flexi 1j 220 Mo 1 DT, Flexi 2j 440 Mo 2 DT, Flexi 1.25 Go 5 DT, Flexi 30j 2.8 Go 10 DT, BIG Flexi 6 Go 15 DT, **Flexi+ 25 Go 25 DT (Populaire)**, Xtra Flexi 35 Go 40 DT (120 min + Starzplay), Flexi+ 55 Go 50 DT, Flexi+ 75 Go 60 DT, Flexi+ 100 Go 72 DT, Flexi 200 Go 100 DT, Flexi 500 Go 250 DT (5 mois), **Flexi 1000 Go 500 DT (12 mois, 0.500 DT / Go)**
- **Orange — 9** : Option 1.25 Go 5 DT, 4 Go 10 DT, 6 Go 15 DT, **Option 25 Go 30 DT (Populaire)**, 42 Go 46,2 DT, 60 Go 60 DT, 100 Go 72 DT, 200 Go 100 DT, Option 500 Go 250 DT (365 j)

⚠️ **Écarts avec TuniRecharge à connaître** (l'original n'a pas les mêmes
validités) : Ooredoo 200 Go = 60 j (pas 120 j), Orange 100 Go = 60 j
(pas 90 j), Orange 200 Go = 60 j (pas 120 j). Les prix sont ceux de l'original.

## 🚀 Installation & lancement

```bash
cd rechargetn
npm install
cp .env.example .env   # puis remplir : JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, numéros WhatsApp / D17 / Flouci
npm start              # http://localhost:3000
```

- Base SQLite créée automatiquement : `rechargetn.db` (aucune compilation native, `node:sqlite`).
- `npm run seed` : (ré)initialise la base + le catalogue.
- Node.js **>= 22** requis.

## 🔐 Identifiants par défaut

| Rôle | Email | Mot de passe |
|---|---|---|
| **Admin** | `admin@rechargetn.tn` | `admin123` |

> ⚠️ **À changer immédiatement** : mot de passe admin (`ADMIN_PASSWORD` dans `.env` avant le premier lancement), `JWT_SECRET`, numéros WhatsApp / D17 / Flouci (dans `.env` ou dans **Admin → Paramètres**).
>
> **Connexion :** les clients se connectent par **numéro de téléphone + mot de passe** (page Mon compte). Seul l'administrateur se connecte par **email** (bouton Admin → Email administrateur).

## 💳 Paiement — limitation importante

**D17 / Flouci sont manuels** : le client paie sur votre numéro, saisit sa
référence de transaction, et **vous confirmez manuellement** la commande dans
l'admin (`Pending → Processing → Completed`). Il n'y a **pas de vérification
automatique** du paiement. Le paiement par **solde** est lui immédiat et
automatique.

## 🌐 Déploiement — NOUVEAU service, ne pas réutiliser celui de TuniRecharge

1. Créez un **nouveau dépôt GitHub** (ex. `rechargetn`) et uploadez le
   **contenu** de ce dossier (les fichiers décompressés, pas le zip) à sa racine.
2. Sur Render, créez un **nouveau Web Service** Node.js depuis ce dépôt
   (ne touchez pas au service `recharge-mobile-tn` existant).
3. Build : `npm install` — Start : `npm start`. Language : **Node**.
   Root Directory : vide.
4. Variables d'environnement : `JWT_SECRET`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, `WHATSAPP_NUMBER`, `D17_NUMBER`, `FLOUCI_NUMBER`.
   (`PORT` est injecté par Render.)
5. **Persistent Disk** obligatoire pour SQLite : montez un disque sur `/data`
   et définissez `DB_PATH=/data/rechargetn.db`, sinon la base est perdue à
   chaque redéploiement.
6. Plan gratuit : le service s'endort après inactivité (premier chargement
   lent) — passez au plan payant pour un site pro.

## 🗄️ Base de données

Tables : `users` (rôle client/admin, `status` pending/approved/rejected,
`balance`), `plans` (avec `bonus` et `validity_label` en plus : bonus vert et
libellé de validité affichés sur les cartes), `orders` (statuts
Pending/Processing/Completed/Cancelled/Scheduled, `scheduled_for`),
`wallet_tx`, `promos`, `favorites`, `settings`.

## ✅ Checklist avant mise en ligne

- [ ] Changer le mot de passe admin (`admin123`) et le `JWT_SECRET`
- [ ] Renseigner les **vrais numéros** WhatsApp, D17 et Flouci (Admin → Paramètres)
- [ ] Vérifier les **prix et validités** (voir « Écarts » ci-dessus)
- [ ] Tester le parcours complet : inscription → approbation admin → connexion → crédit solde → achat par solde → commande D17 avec référence
- [ ] Sauvegarder `rechargetn.db` régulièrement (c'est toute la boutique : clients, soldes, commandes)

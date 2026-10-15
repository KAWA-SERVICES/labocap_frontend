import {
  Home,
  Stethoscope,
  FileCheck,
  Building2,
  Users,
  User,
  Receipt,
  DollarSign,
  Folder,
  TrendingDown,
  Package,
  Truck,
  RefreshCw,
  Briefcase,
  AlertCircle,
  UserCheck,
  Settings,
  Users2,
  BookOpen,
  FlaskConical,
  Syringe,
  BarChart3,
  ScrollText,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/constants/permissions";
import type { AppModule } from "@/lib/modules";
import type { BadgeKey } from "@/components/layout/useSidebarBadges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Condition d'affichage d'une entrée (ou d'une rubrique). Tous les critères
 * présents doivent être remplis ; une entrée sans `gate` est visible de tous.
 *
 *   permission   une permission, ou plusieurs combinées selon `mode`
 *   mode         "any" (défaut) : l'une suffit — "all" : toutes sont requises
 *   module       module optionnel requis (cf. src/lib/modules.ts)
 */
export interface Gate {
  permission?: Permission | Permission[];
  mode?: "any" | "all";
  module?: AppModule;
}

/** Actions déclenchées par une sous-entrée sans lien (ex. modal global). */
export type NavActionKey = "openTimeoffModal";

export type NavSubItem =
  | { kind: "link"; href: string; label: string; gate?: Gate }
  | { kind: "action"; action: NavActionKey; label: string; gate?: Gate };

export type NavEntry =
  | {
      kind: "link";
      href: string;
      label: string;
      icon: React.ReactNode;
      badge?: BadgeKey;
      gate?: Gate;
    }
  | {
      kind: "collapse";
      label: string;
      icon: React.ReactNode;
      badge?: BadgeKey;
      gate?: Gate;
      children: NavSubItem[];
    };

export interface NavSection {
  /** Libellé affiché — et clé de l'état replié persisté (`ui.store`). */
  label: string;
  gate?: Gate;
  items: NavEntry[];
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * Définition du menu latéral, dans l'ordre d'affichage. Le rendu (rubriques
 * repliables, accordéon, rail d'icônes, overlay mobile) vit dans `sidebar.tsx`.
 *
 * Une rubrique s'affiche même si aucune de ses entrées n'est visible — comme
 * avant l'extraction de cette configuration.
 */
export const NAV: NavSection[] = [
  // ══════════════ TABLEAU DE BORD ══════════════
  {
    label: "TABLEAU DE BORD",
    items: [
      {
        kind: "link",
        href: "/home",
        label: "Tableau de bord",
        icon: <Home className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_DASHBOARD },
      },
      // Analyses sorties du tableau de bord : même permission, rythme de
      // consultation différent (hebdomadaire plutôt que quotidien).
      {
        kind: "link",
        href: "/statistiques",
        label: "Statistiques",
        icon: <BarChart3 className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_ADMIN_DASHBOARD },
      },
    ],
  },

  // ══════════════ EXAMENS ══════════════
  {
    label: "EXAMENS",
    items: [
      // Catalogue d'examens
      {
        kind: "collapse",
        label: "Catalogue d'examens",
        icon: <FlaskConical className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_TESTS },
        children: [
          { kind: "link", href: "/examens", label: "Tous les examens", gate: { permission: PERMISSIONS.VIEW_TESTS } },
          { kind: "link", href: "/examens/categories", label: "Catégories", gate: { permission: PERMISSIONS.VIEW_CATEGORY_TESTS } },
        ],
      },

      // Demandes d'examen
      {
        kind: "collapse",
        label: "Demandes d'examen",
        icon: <Stethoscope className="w-5 h-5" />,
        badge: "testOrderPending",
        gate: { permission: PERMISSIONS.VIEW_TEST_ORDERS },
        children: [
          // Laravel affiche « Mon espace » à tout utilisateur du menu Demandes
          // d'examen (app2.blade.php) : pas de restriction au rôle Docteur.
          { kind: "link", href: "/test-orders/myspace", label: "Mon espace" },
          { kind: "link", href: "/test-orders", label: "Toutes les demandes" },
          // NB : « Ajouter » (route test_order.create) est commenté dans
          // app2.blade.php : absent des deux menus, pas un écart. La page
          // /test-orders/create reste atteignable depuis la liste.
          { kind: "link", href: "/test-orders/macroscopy", label: "Macroscopie", gate: { permission: PERMISSIONS.VIEW_TEST_ORDER_ASSIGNMENTS } },
          { kind: "link", href: "/test-orders/assignments", label: "Affectation", gate: { permission: PERMISSIONS.VIEW_TEST_ORDER_ASSIGNMENTS } },
          { kind: "link", href: "/reports/suivi", label: "Suivi des demandes", gate: { permission: PERMISSIONS.VIEW_TEST_ORDER_ASSIGNMENTS } },
          // Le catalogue des étiquettes se remplit à l'usage ; cet écran
          // n'existe que pour corriger une faute de frappe ou retirer un
          // marquage abandonné. D'où la permission d'écriture.
          { kind: "link", href: "/test-orders/etiquettes", label: "Étiquettes", gate: { permission: PERMISSIONS.MANAGE_TEST_ORDER_ASSIGNMENTS } },
          { kind: "link", href: "/search", label: "Rechercher" },
        ],
      },

      // Immuno
      {
        kind: "link",
        href: "/test-orders/immuno",
        label: "Immuno",
        icon: <Syringe className="w-5 h-5" />,
        badge: "immunoPending",
        gate: { permission: PERMISSIONS.VIEW_TEST_ORDERS },
      },

      // Comptes rendu
      {
        kind: "collapse",
        label: "Comptes rendu",
        icon: <FileCheck className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_REPORTS },
        children: [
          { kind: "link", href: "/reports", label: "Tous les comptes rendu" },
          { kind: "link", href: "/reports/templates", label: "Templates", gate: { permission: PERMISSIONS.VIEW_SETTINGS } },
          { kind: "link", href: "/reports/history", label: "Historiques" },
          { kind: "link", href: "/reports/settings", label: "Paramètres", gate: { permission: PERMISSIONS.VIEW_SETTINGS } },
        ],
      },

      // Hôpitaux
      {
        kind: "link",
        href: "/hospitals",
        label: "Hôpitaux",
        icon: <Building2 className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_HOSPITALS },
      },

      // Médecins
      {
        kind: "link",
        href: "/doctors",
        label: "Médecins traitants",
        icon: <Users className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_DOCTORS },
      },

      // Patients
      {
        kind: "link",
        href: "/patients",
        label: "Patients",
        icon: <User className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_PATIENTS },
      },

      // NB : « Consultations » et « Prestations » sont volontairement absents du
      // menu — comme dans la navigation Laravel (app2.blade.php), qui n'expose pas
      // ces modules dans la sidebar (les routes existent mais pas l'entrée de menu).
    ],
  },

  // ══════════════ COMPTABILITÉS ══════════════
  {
    label: "COMPTABILITÉS",
    items: [
      // Factures
      {
        kind: "collapse",
        label: "Factures",
        icon: <Receipt className="w-5 h-5" />,
        badge: "invoicePending",
        gate: { permission: PERMISSIONS.VIEW_INVOICES },
        children: [
          { kind: "link", href: "/invoices", label: "Toutes les Factures" },
          { kind: "link", href: "/invoices/create", label: "Créer" },
          // NB : « Rapports » et « Paramètre » sont volontairement absents, à la
          // demande du métier — écart assumé vis-à-vis de Laravel (app2.blade.php),
          // qui les expose sous permission view-setting-invoice. Les routes
          // /invoices/business et /invoices/settings restent accessibles par URL.
        ],
      },

      // Caisses
      {
        kind: "collapse",
        label: "Caisses",
        icon: <DollarSign className="w-5 h-5" />,
        badge: "voucherPending",
        gate: { permission: PERMISSIONS.VIEW_CASHBOXES },
        children: [
          { kind: "link", href: "/cashbox/vente", label: "Caisse de vente" },
          { kind: "link", href: "/cashbox/depense", label: "Caisse de dépense" },
          { kind: "link", href: "/cashbox/ticket", label: "Bon de caisse" },
          { kind: "link", href: "/cashbox/cashbox-daily", label: "Ouverture et fermeture" },
        ],
      },

      // Contrats
      {
        kind: "link",
        href: "/contracts",
        label: "Contrats",
        icon: <Folder className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_CONTRATS },
      },

      // Dépenses
      {
        kind: "collapse",
        label: "Dépenses",
        icon: <TrendingDown className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_EXPENSES },
        children: [
          { kind: "link", href: "/expenses", label: "Toutes les dépenses" },
          { kind: "link", href: "/expenses/categories", label: "Catégories", gate: { permission: PERMISSIONS.MANAGE_SETTINGS } },
        ],
      },

      // Stocks
      {
        kind: "collapse",
        label: "Stocks",
        icon: <Package className="w-5 h-5" />,
        badge: "stockMinimum",
        gate: { permission: PERMISSIONS.VIEW_ARTICLES },
        children: [
          { kind: "link", href: "/inventory/movements", label: "Historique des stocks", gate: { permission: PERMISSIONS.VIEW_MOVEMENTS } },
          { kind: "link", href: "/inventory/articles", label: "Tous les articles" },
          { kind: "link", href: "/inventory/units", label: "Unité de mesure" },
        ],
      },

      // Fournisseurs
      {
        kind: "collapse",
        label: "Fournisseurs",
        icon: <Truck className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_SUPPLIERS },
        children: [
          { kind: "link", href: "/suppliers", label: "Tous les fournisseurs" },
          { kind: "link", href: "/suppliers/categories", label: "Catégories" },
        ],
      },

      // Remboursements
      {
        kind: "collapse",
        label: "Remboursements",
        icon: <RefreshCw className="w-5 h-5" />,
        badge: "refundPending",
        gate: { permission: PERMISSIONS.VIEW_REFUNDS },
        children: [
          { kind: "link", href: "/refunds", label: "Historiques" },
          { kind: "link", href: "/refunds/create", label: "Ajouter" },
          { kind: "link", href: "/refunds/settings", label: "Paramètres" },
        ],
      },

      // Clients Professionnels
      {
        kind: "link",
        href: "/clients",
        label: "Clients Professionnels",
        icon: <Briefcase className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_CLIENTS },
      },
    ],
  },

  // ══════════════ ADMINISTRATIONS ══════════════
  {
    label: "ADMINISTRATIONS",
    items: [
      // Signaler un problème
      {
        kind: "collapse",
        label: "Signaler un problème",
        icon: <AlertCircle className="w-5 h-5" />,
        badge: "ticketOpen",
        children: [
          { kind: "link", href: "/support", label: "Historiques" },
          { kind: "link", href: "/support/signaler", label: "Signaler" },
        ],
      },

      // Utilisateurs
      {
        kind: "collapse",
        label: "Utilisateurs",
        icon: <UserCheck className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_USERS },
        children: [
          // La liste des permissions n'est pas exposée au menu : ce sont
          // 307 lignes techniques (« view-appel-by-reports », « edit-tests »)
          // qu'on n'administre pas une à une. Elles s'attribuent par les
          // rôles, écran ci-dessous. La route reste accessible en direct.
          { kind: "link", href: "/settings/roles", label: "Rôles", gate: { permission: PERMISSIONS.VIEW_ROLES } },
          { kind: "link", href: "/settings/users", label: "Tous les utilisateurs", gate: { permission: PERMISSIONS.VIEW_USERS } },
        ],
      },

      // Journal des consultations (lecture seule)
      {
        kind: "link",
        href: "/settings/journal-acces",
        label: "Journal d'accès",
        icon: <ScrollText className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_AUDIT },
      },

      // Paramètres
      {
        kind: "link",
        href: "/settings",
        label: "Paramètres",
        icon: <Settings className="w-5 h-5" />,
        gate: { permission: PERMISSIONS.VIEW_SETTINGS },
      },
    ],
  },

  // ══════════════ EQUIPES ══════════════
  {
    label: "EQUIPES",
    items: [
      // Noms calqués sur le menu Laravel (layouts/app2 : EQUIPES) :
      // Tous les employés / Demande de congé / Toutes les demandes.
      // Laravel n'a aucune entrée « Paie » (la paie vit dans la fiche employé).
      // Seul « Tous les employés » est sous permission (view-employees) ; les deux
      // entrées de congés sont ouvertes à tous, sinon un employé sans droit RH ne
      // peut plus déposer sa propre demande de congé.
      {
        kind: "collapse",
        label: "Equipes",
        icon: <Users2 className="w-5 h-5" />,
        children: [
          { kind: "link", href: "/hr/employees", label: "Tous les employés", gate: { permission: PERMISSIONS.VIEW_EMPLOYEES } },
          { kind: "action", action: "openTimeoffModal", label: "Demande de congé" },
          { kind: "link", href: "/hr/timeoff", label: "Toutes les demandes" },
        ],
      },
    ],
  },

  // ══════════════ DOCUMENTATIONS ══════════════
  {
    label: "DOCUMENTATIONS",
    items: [
      // Structure identique à Laravel (app2.blade.php) : seul « Tous les
      // documents » est protégé (view-docs) ; « Partagé avec moi » et
      // « Toutes les catégories » sont visibles par tous ; pas de corbeille.
      {
        kind: "collapse",
        label: "Documentations",
        icon: <BookOpen className="w-5 h-5" />,
        children: [
          { kind: "link", href: "/docs", label: "Tous les documents", gate: { permission: PERMISSIONS.VIEW_DOCS } },
          { kind: "link", href: "/docs/shared", label: "Partagé avec moi" },
          { kind: "link", href: "/docs/categories", label: "Toutes les catégories" },
        ],
      },

      // NB : pas d'entrée « Recherche » à la racine — Laravel n'expose
      // « Rechercher » que sous « Demandes d'examen » (app2.blade.php), où
      // elle figure déjà. Ce doublon a été retiré.
    ],
  },
];

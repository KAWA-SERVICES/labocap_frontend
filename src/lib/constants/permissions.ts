export const PERMISSIONS = {
  // Patients
  VIEW_PATIENTS: "view-patients",
  CREATE_PATIENTS: "create-patients",
  EDIT_PATIENTS: "edit-patients",
  DELETE_PATIENTS: "delete-patients",

  // Tests / Examens catalogue
  VIEW_TESTS: "view-tests",
  CREATE_TESTS: "create-tests",
  EDIT_TESTS: "edit-tests",
  DELETE_TESTS: "delete-tests",
  VIEW_CATEGORY_TESTS: "view-category-tests",

  // Test Orders / Demandes
  VIEW_TEST_ORDER_ASSIGNMENTS: "view-test-order-assignments",
  MANAGE_TEST_ORDER_ASSIGNMENTS: "manage-test-order-assignments",
  VIEW_TEST_ORDERS: "view-test-orders",
  CREATE_TEST_ORDERS: "create-test-orders",
  EDIT_TEST_ORDERS: "edit-test-orders",
  DELETE_TEST_ORDERS: "delete-test-orders",
  VALIDATE_TEST_ORDERS: "validate-test-orders",

  // Reports
  VIEW_REPORTS: "view-reports",
  CREATE_REPORTS: "create-reports",
  EDIT_REPORTS: "edit-reports",
  DELETE_REPORTS: "delete-reports",
  REVIEW_REPORTS: "review-reports",
  VALIDATE_REPORTS: "validate-reports",
  // Remise au comptoir : signature du récupérateur, appel du patient, livraison.
  // Distincte de la validation, qui engage un diagnostic.
  DELIVER_REPORTS: "deliver-reports",
  SIGN_REPORTS: "sign-reports",
  /** Versions antérieures d'un compte rendu signé : lecture seule, droit distinct. */
  VIEW_REPORT_HISTORY: "view-report-history",

  // Macroscopy
  VIEW_MACRO: "view-macro",
  CREATE_MACRO: "create-macro",
  EDIT_MACRO: "edit-macro",

  // Invoices
  VIEW_INVOICES: "view-invoices",
  CREATE_INVOICES: "create-invoices",
  EDIT_INVOICES: "edit-invoices",
  DELETE_INVOICES: "delete-invoices",
  MANAGE_FINANCE: "view-dashbord-finance",
  /** Encaissement : seule permission que Laravel vérifie sur la page facture (show.blade.php). */
  VIEW_CASHIER: "view-cashier",

  // Cashbox (granular — from Laravel @can slugs)
  VIEW_CASHBOX: "view-cashbox",
  VIEW_CASHBOXES: "view-cashboxes",
  MANAGE_CASHBOX: "manage-cashbox",
  VIEW_CASHBOX_ADDS: "view-cashbox-adds",
  VIEW_CASHBOX_TICKETS: "view-cashbox-tickets",
  VIEW_CASHBOX_DAILIES: "view-cashbox-dailies",
  CREATE_CASHBOX_DAILIES: "create-cashbox-dailies",
  EDIT_CASHBOX_DAILIES: "edit-cashbox-dailies",
  CREATE_CASHBOX_TICKETS: "create-cashbox-tickets",
  EDIT_CASHBOX_TICKETS: "edit-cashbox-tickets",
  DELETE_CASHBOX_TICKETS: "delete-cashbox-tickets",
  CREATE_CASHBOX_TICKET_DETAILS: "create-cashbox-ticket-details",
  DELETE_CASHBOX_TICKET_DETAILS: "delete-cashbox-ticket-details",
  // Bouton « Approvisionner la caisse » de la caisse de dépense (slug Laravel).
  VIEW_ADD_CASHBOX_EXPENSE: "view-add-cashbox-expense",

  // Banks
  VIEW_BANKS: "view-banks",
  CREATE_BANKS: "create-banks",
  EDIT_BANKS: "edit-banks",
  DELETE_BANKS: "delete-banks",

  // Doctors
  VIEW_DOCTORS: "view-doctors",
  CREATE_DOCTORS: "create-doctors",
  EDIT_DOCTORS: "edit-doctors",
  DELETE_DOCTORS: "delete-doctors",

  // Hospitals
  VIEW_HOSPITALS: "view-hospitals",
  CREATE_HOSPITALS: "create-hospitals",
  EDIT_HOSPITALS: "edit-hospitals",
  DELETE_HOSPITALS: "delete-hospitals",

  // Clients
  VIEW_CLIENTS: "view-clients",
  CREATE_CLIENTS: "create-clients",
  EDIT_CLIENTS: "edit-clients",
  DELETE_CLIENTS: "delete-clients",

  // Contracts (Laravel uses 'view-contrats')
  // Contrats — les slugs sont en français côté base, hérités de Laravel.
  //
  // Une seconde famille anglaise (« view-contracts », « edit-contracts »…)
  // cohabitait ici et servait dans toutes les pages du module. Ces slugs
  // n'existent dans aucune base : `can()` renvoyait donc toujours faux et la
  // page des contrats se refusait à tout le monde, y compris aux rôles qui
  // détiennent bien le droit. Seule la barre latérale lisait le bon nom, d'où
  // un menu visible ouvrant sur un refus.
  VIEW_CONTRATS: "view-contrats",
  CREATE_CONTRATS: "create-contrats",
  EDIT_CONTRATS: "edit-contrats",
  DELETE_CONTRATS: "delete-contrats",

  // Expenses
  VIEW_EXPENSES: "view-expenses",
  CREATE_EXPENSES: "create-expenses",
  EDIT_EXPENSES: "edit-expenses",
  DELETE_EXPENSES: "delete-expenses",
  VIEW_EXPENCE_DETAILS: "view-expence-details",
  CREATE_EXPENCE_DETAILS: "create-expence-details",
  DELETE_EXPENCE_DETAILS: "delete-expence-details",
  // Autorise le changement de statut depuis la colonne « Traitement » de la liste.
  VIEW_PROCESS_CASHBOX_TICKETS: "view-process-cashbox-tickets",
  // Lève les verrouillages de la page détail quand la dépense est déjà payée.
  VIEW_SUPER_DEPENSES: "view-super-depenses",

  // Inventory
  VIEW_ARTICLES: "view-articles",
  CREATE_ARTICLES: "create-articles",
  EDIT_ARTICLES: "edit-articles",
  DELETE_ARTICLES: "delete-articles",

  // Suppliers
  VIEW_SUPPLIERS: "view-suppliers",
  CREATE_SUPPLIERS: "create-suppliers",
  EDIT_SUPPLIERS: "edit-suppliers",
  DELETE_SUPPLIERS: "delete-suppliers",
  VIEW_SUPPLIER_CATEGORIES: "view-supplier-categories",
  CREATE_SUPPLIER_CATEGORIES: "create-supplier-categories",
  EDIT_SUPPLIER_CATEGORIES: "edit-supplier-categories",
  DELETE_SUPPLIER_CATEGORIES: "delete-supplier-categories",

  // HR — slugs réels du backend Spring Boot
  VIEW_HR: "view-hr",
  MANAGE_EMPLOYEES: "manage-employees",
  VIEW_EMPLOYEES: "view-employees",
  CREATE_EMPLOYEES: "manage-employees",
  EDIT_EMPLOYEES: "manage-employees",
  DELETE_EMPLOYEES: "manage-employees",
  MANAGE_PAYROLL: "view-employee-payrolls",
  CREATE_PAYROLL: "create-employee-payrolls",
  MANAGE_TIMEOFF: "view-employee-timeoffs",

  // Dashboard (rôle-based views)
  /** Toutes les routes `/dashboard/**` : sans elle, l'API répond 403. */
  VIEW_DASHBOARD: "view-dashboard",
  /** Chiffre d'affaires et état des factures (`/dashboard/revenue`, `/dashboard/invoice-status`). */
  VIEW_DASHBOARD_FINANCE: "view-dashboard-finance",
  VIEW_ADMIN_DASHBOARD: "view-admin-dashboard",
  VIEW_SECRETARIAT_DASHBOARD: "view-secretariat-dashboard",
  VIEW_PATHOLOGIST_DASHBOARD: "view-pathologist-dashboard",
  VIEW_DASHBORD_FINANCE: "view-dashbord-finance",

  // Settings / Admin (granular)
  VIEW_SETTING_INVOICE: "view-setting-invoice",
  VIEW_SETTING_REPORT_TEMPLATES: "view-setting-report-templates",
  VIEW_MOVEMENTS: "view-movements",
  CREATE_MOVEMENTS: "create-movements",
  VIEW_REFUND_REQUESTS: "view-refund-requests",
  VIEW_PERMISSIONS: "view-permissions",
  CREATE_PERMISSIONS: "create-permissions",
  EDIT_PERMISSIONS: "edit-permissions",
  DELETE_PERMISSIONS: "delete-permissions",
  VIEW_ROLES: "view-roles",
  VIEW_SETTINGS: "view-settings",
  MANAGE_SETTINGS: "edit-settings",
  VIEW_USERS: "view-users",
  CREATE_USERS: "create-users",
  EDIT_USERS: "edit-users",
  DELETE_USERS: "delete-users",
  // Écriture des rôles — mêmes slugs CRUD que le reste de la base héritée.
  //
  // Une constante agrégée « manage-roles » servait ici. Le commentaire qui la
  // justifiait s'appuyait sur V2__seed_permissions.sql, mais cette migration ne
  // s'exécute jamais sur un environnement réel : Flyway y démarre à la ligne de
  // base 50 et le schéma vient de la reprise Laravel. Vérifié en base — le slug
  // « manage-roles » n'existe nulle part.
  //
  // Conséquence : l'entrée « Rôles » du menu ne s'affichait jamais et l'écran
  // restait fermé à tous, super-admin compris, alors que lui seul détient bien
  // view/create/edit/delete-roles. C'est aussi ce que le RoleController exige
  // côté serveur, ce que l'ancien commentaire signalait déjà comme une
  // « incohérence backend » — c'était en réalité le frontend qui divergeait.
  CREATE_ROLES: "create-roles",
  EDIT_ROLES: "edit-roles",
  DELETE_ROLES: "delete-roles",
  MANAGE_PERMISSIONS: "manage-permissions",
  // Journal des consultations : qui a lu, téléchargé ou imprimé quoi.
  VIEW_AUDIT: "view-audit",

  // Consultations
  VIEW_CONSULTATIONS: "view-consultations",
  CREATE_CONSULTATIONS: "create-consultations",
  EDIT_CONSULTATIONS: "edit-consultations",
  DELETE_CONSULTATIONS: "delete-consultations",
  VIEW_TYPE_CONSULTATIONS: "view-type-consultations",

  // Prestations
  VIEW_PRESTATIONS: "view-prestations",
  CREATE_PRESTATIONS: "create-prestations",
  EDIT_PRESTATIONS: "edit-prestations",
  DELETE_PRESTATIONS: "delete-prestations",

  // Commandes de prestations
  VIEW_PRESTATION_ORDERS: "view-prestation-orders",
  CREATE_PRESTATION_ORDERS: "create-prestation-orders",
  EDIT_PRESTATION_ORDERS: "edit-prestation-orders",
  DELETE_PRESTATION_ORDERS: "delete-prestation-orders",

  // Support / Tickets
  VIEW_SUPPORT: "view-support",
  MANAGE_SUPPORT: "manage-support",

  // Documentation
  VIEW_DOCS: "view-documentation-categories",
  CREATE_DOCS: "create-docs",
  EDIT_DOCS: "edit-docs",
  DELETE_DOCS: "delete-docs",

  // Refunds
  VIEW_REFUNDS: "view-refund-requests",
  CREATE_REFUNDS: "create-refund-requests",
  EDIT_REFUNDS: "edit-refund-requests",
  DELETE_REFUNDS: "delete-refund-requests",
  /** Autorise le changement de statut d'une demande (select Laravel). */
  PROCESS_REFUNDS: "view-process-refund-request",
  VIEW_REFUND_REASONS: "view-refund-reasons",
  CREATE_REFUND_REASONS: "create-refund-reasons",
  EDIT_REFUND_REASONS: "edit-refund-reasons",
  DELETE_REFUND_REASONS: "delete-refund-reasons",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

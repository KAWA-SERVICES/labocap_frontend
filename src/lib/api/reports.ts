import apiClient from "./client";
import type { PageResponse } from "@/types/api";

export type ReportStatus = "DRAFT" | "PENDING_REVIEW" | "VALIDATED" | "DELIVERED";

/**
 * Une modification apportée au compte rendu après sa signature.
 *
 * Un compte rendu signé engage le médecin qui l'a signé ; le modifier ensuite
 * reste permis — les compléments arrivent après la remise du résultat — mais
 * l'auteur et la date en sont conservés et mis en évidence.
 */
export interface ModificationApresSignature {
  /** Absent si le compte a depuis été supprimé ; `auteur` reste lisible. */
  auteurId: string | null;
  auteur: string;
  date: string;
  /** Champs touchés, déjà mis en forme par le serveur. */
  champs: string;
}

export interface ReportLog {
  action: string;
  description: string;
  userName: string;
  createdAt: string;
}

export interface Report {
  id: string;
  testOrderId: string;
  testOrderCode: string;
  titleId?: string;
  titleName?: string;
  content?: string;
  contentMicro?: string;
  comment?: string;
  commentSup?: string;
  descriptionSupplementaire?: string;
  descriptionSupplementaireMicro?: string;
  status: ReportStatus;
  isDelivered: boolean;
  isCalled: boolean;
  receiverName?: string;
  signatureDate?: string;
  deliveryDate?: string;
  callDate?: string;
  signatory1Id?: string;
  signatory1Name?: string;
  branchId?: string;
  tagNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetail extends Report {
  code?: string;
  patientName?: string;
  signatory2Id?: string;
  signatory2Name?: string;
  signatory3Id?: string;
  signatory3Name?: string;
  reviewedById?: string;
  reviewedByName?: string;
  tagIds?: string[];
  logs: ReportLog[];
}

export interface ReportRequest {
  testOrderId?: string;
  titleId?: string;
  content?: string;
  contentMicro?: string;
  comment?: string;
  commentSup?: string;
  descriptionSupplementaire?: string;
  descriptionSupplementaireMicro?: string;
  reviewedById?: string;
  signatory1Id?: string;
  signatory2Id?: string;
  signatory3Id?: string;
  receiverName?: string;
  status?: ReportStatus;
  tagIds?: string[];
  /**
   * Pourquoi on retouche un compte rendu déjà sorti. Exigé par le serveur
   * (20 caractères au moins) quand le compte rendu est livré ; facultatif sinon.
   */
  reason?: string;
}

/** Entrée de la liste des versions antérieures d'un compte rendu. */
export interface ReportVersionResume {
  version: number;
  savedAt: string;
  /** Auteur de la modification qui a provoqué la prise de version. */
  savedBy: string;
  status: ReportStatus;
}

/** Une version antérieure, textes compris (état du compte rendu avant d'être écrasé). */
export interface ReportVersion extends ReportVersionResume {
  title?: string;
  signataires?: string;
  content?: string;
  contentMicro?: string;
  comment?: string;
  commentSup?: string;
  descriptionSupplementaire?: string;
  descriptionSupplementaireMicro?: string;
}

export interface ReportSuivi {
  examens: {
    histologie: number;
    immunoExterne: number;
    immunoInterne: number;
    cytologie: number;
    totalGeneral: number;
  };
  rapports: {
    attente: number;
    termine: number;
    affecte: number;
  };
  macros: {
    pathology: number;
  };
  patientCalled: {
    called: number;
    notCalled: number;
    deliver: number;
    notDeliver: number;
  };
  listYears: number[];
}

export interface StoreSignatureRequest {
  signatorName: string;
  /**
   * À quel titre la personne emporte le compte rendu — « Lui-même », « Mère »,
   * « Coursier »…
   *
   * Facultative côté serveur : un champ qu'on remplit pour passer outre ne
   * vaudrait rien comme justification. Mais le web et le mobile écrivent les
   * mêmes colonnes, et ne la poser que sur l'un donnerait une trace à moitié
   * remplie selon le guichet emprunté.
   */
  relation?: string;
  signature: string;
}

/**
 * Ligne du tableau "Suivi des demandes" (1 par compte-rendu).
 * Réplique exacte du DTO backend {@code ReportSuiviRowDto}.
 */
export interface ReportSuiviRow {
  reportId: string;
  testOrderId: string;
  testOrderCode: string;
  typeOrderTitle: string;
  patientFirstname: string;
  patientLastname: string;
  patientPhone: string;
  isUrgent: boolean;
  createdAt: string;
  reportStatus: ReportStatus;
  hasMacro: boolean;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  isCalled: boolean;
  isDelivered: boolean;
  retrieverName?: string;
  retrieverSignature?: string;
  deliveryDate?: string;
}

export interface ReportSuiviListParams {
  page?: number;
  size?: number;
  search?: string;
  /** 1=Livrée, 2=Informée, 3=En attente, 4=Terminée, 5=Non livrée */
  status?: number;
  typeOrderId?: string;
  dateBegin?: string;
  dateEnd?: string;
  isUrgent?: boolean;
  /** En retard : report DRAFT créé il y a plus de 21 jours */
  isLate?: boolean;
}

/**
 * Ligne du tableau "Recherche générale" (1 par compte-rendu).
 * Réplique exacte du DTO backend renvoyé par /reports/search-global.
 */
export interface ReportGlobalSearchRow {
  reportId: string;
  codeReport?: string;
  testOrderId: string;
  codeExamen?: string;
  typeExamen?: string;
  contractName?: string;
  patientId?: string;
  patientFirstname?: string;
  patientLastname?: string;
  doctorId?: string;
  doctorName?: string;
  hospitalId?: string;
  hospitalName?: string;
  referenceHospital?: string;
  dateCreation: string;
  isUrgent?: boolean;
}

export interface ReportGlobalSearchParams {
  page?: number;
  size?: number;
  typeOrderIds?: string[];
  contratIds?: string[];
  patientIds?: string[];
  doctorIds?: string[];
  hospitalIds?: string[];
  referenceHospital?: string;
  dateBegin?: string;
  dateEnd?: string;
  content?: string;
  isUrgent?: boolean;
}

/**
 * Ligne du tableau "Tous les comptes rendu" (page liste principale).
 * Réplique exacte du DTO backend {@code ReportListDto}.
 */
export interface ReportListItem {
  id: string;
  reportCode?: string;
  testOrderId: string;
  testOrderCode: string;
  patientId: string;
  patientCode?: string;
  patientFirstname: string;
  patientLastname: string;
  patientPhone?: string;
  typeOrderTitle?: string;
  status: ReportStatus;
  isDelivered: boolean;
  isCalled: boolean;
  signatureDate?: string;
  createdAt: string;
}

export interface ReportListParams {
  page?: number;
  size?: number;
  search?: string;
  status?: string;
  dateBegin?: string;
  dateEnd?: string;
}

/**
 * Statistiques de performance des rapports.
 * Réplique du DTO backend {@code ReportPerformanceDto}.
 */
export interface ReportPerformance {
  totalReports: number;
  withinDeadline: number;
  beyondDeadline: number;
  percentageInDeadline: number;
  percentageOverDeadline: number;
}

export interface ReportPerformanceParams {
  doctorId?: string;
  month?: number;
  year?: number;
}

export const reportsApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<{ content: Report[]; totalElements: number; totalPages: number }>(
      "/reports",
      { params }
    ),

  findById: (id: string) => apiClient.get<ReportDetail>(`/reports/${id}`),

  create: (data: ReportRequest) => apiClient.post<Report>("/reports", data),

  update: (id: string, data: Partial<ReportRequest>) =>
    apiClient.put<Report>(`/reports/${id}`, data),

  delete: (id: string) => apiClient.delete(`/reports/${id}`),

  validate: (id: string) => apiClient.post(`/reports/${id}/validate`),

  deliver: (id: string, receiverName: string) =>
    apiClient.post(`/reports/${id}/deliver`, null, { params: { receiverName } }),

  storeSignature: (id: string, data: StoreSignatureRequest) =>
    apiClient.post(`/reports/${id}/store-signature`, data),

  deliveredPatient: (id: string) =>
    apiClient.patch(`/reports/${id}/delivered-patient`),

  informedPatient: (id: string) =>
    apiClient.patch(`/reports/${id}/informed-patient`),

  /** Lance l'appel vocal OurVoice au patient (résultat disponible). */
  callPatient: (id: string) =>
    apiClient.post<{ appelId: string; reportId: string; audioUrl: string }>(
      `/reports/${id}/call`
    ),

  /** Envoie un SMS OurVoice au patient. */
  sendSms: (id: string) =>
    apiClient.post<{ status: string }>(`/reports/${id}/sms`),

  /**
   * Prévient le patient en laissant le serveur choisir le canal — réplique de
   * l'action Laravel `report.callOrSendSms` : SMS si le bon d'examen porte
   * l'option, sinon appel vocal et uniquement entre 8h et 18h.
   */
  notifyPatient: (id: string) =>
    apiClient.post<{
      channel: "SMS" | "CALL" | "NONE";
      reportId: string;
      appelId: string | null;
      message: string;
    }>(`/reports/${id}/notify`),

  /** Statut du dernier appel passé pour ce compte-rendu. */
  getAppelStatus: (id: string) =>
    apiClient.get<{ id: string; reportId: string; appelId: string; createdAt: string }>(
      `/reports/${id}/appel`
    ),

  getSuivi: (params?: { year?: number; month?: number }) =>
    apiClient.get<ReportSuivi>("/reports/suivi", { params }),

  getSuiviList: (params?: ReportSuiviListParams) =>
    apiClient.get<PageResponse<ReportSuiviRow>>("/reports/suivi/list", { params }),

  /**
   * Recherche avancée multi-critères des comptes-rendus (page "Recherche générale").
   * Les tableaux sont sérialisés en paramètres répétés (typeOrderIds=a&typeOrderIds=b).
   */
  searchGlobal: (params?: ReportGlobalSearchParams) =>
    apiClient.get<PageResponse<ReportGlobalSearchRow>>("/reports/search-global", {
      params,
      paramsSerializer: { indexes: null },
    }),

  downloadPdf: (id: string) =>
    apiClient.get(`/reports/${id}/pdf`, { responseType: "blob" }),

  /** Associe un modèle (template) au compte-rendu. */
  setTemplate: (id: string, templateId: string) =>
    apiClient.patch(`/reports/${id}/template/${templateId}`),

  /**
   * Modifications apportées au compte rendu après sa signature.
   *
   * Route distincte de l'historique complet, qui mêle impressions et
   * enregistrements ordinaires : seul ce qui engage la signature d'un médecin
   * est mis en exergue.
   */
  findModificationsApresSignature: (id: string) =>
    apiClient.get<ModificationApresSignature[]>(
      `/reports/${id}/modifications-apres-signature`,
    ),

  /** Versions antérieures d'un compte rendu, de la plus ancienne à la plus récente. */
  listVersions: (id: string) =>
    apiClient.get<ReportVersionResume[]>(`/reports/${id}/versions`),

  /** Une version antérieure, textes compris. */
  findVersion: (id: string, numero: number) =>
    apiClient.get<ReportVersion>(`/reports/${id}/versions/${numero}`),

  /**
   * Liste paginée des comptes-rendu pour la page "Tous les comptes rendu".
   * Réplique de l'endpoint Laravel "report.getReportsforDatatable".
   */
  getList: (params?: ReportListParams) =>
    apiClient.get<PageResponse<ReportListItem>>("/reports/list", { params }),

  /**
   * Statistiques de performance (délai respecté / hors délai) pour la
   * section "Rapports" de la page liste.
   */
  getPerformanceStats: (params?: ReportPerformanceParams) =>
    apiClient.get<ReportPerformance>("/reports/performance-stats", { params }),

  /**
   * Historique (journal) global des actions sur les comptes-rendus.
   */
  getLogs: (params?: { page?: number; size?: number }) =>
    apiClient.get<PageResponse<LogReportRow>>("/reports/logs", { params }),
};

export interface LogReportRow {
  id: string;
  action: string;
  description?: string;
  date?: string;
  userFullName?: string;
  reportId?: string;
  reportCode?: string;
  testOrderCode?: string;
}

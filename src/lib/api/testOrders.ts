import apiClient from "./client";
import type { PageResponse } from "@/types/api";

export interface DetailTestOrderDto {
  id: string;
  labTestId: string;
  labTestName: string;
  testName: string;
  price: number;
  discount: number;
  total: number;
}

// Alias pour la compatibilité avec les pages existantes
export type TestOrderDetail = DetailTestOrderDto;

// ImageDto retourné par le backend (List<ImageDto>)
export interface ImageDto {
  index: number;
  filename: string;
  url: string;
  /** Identifiant du fichier pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
}

// DiscountDto retourné par le backend
export interface DiscountDto {
  basePrice: number;
  contractPrice: number | null;
  discount: number;
  priceAfterDiscount: number;
}

export interface TestOrder {
  id: string;
  code: string;
  status: string; // TestOrderStatus enum (string)
  prelevementDate?: string;
  referenceHopital?: string;
  isUrgent: boolean;
  subtotal?: number;
  discount?: number;
  total: number;
  patientId: string;
  patientFirstname: string;
  patientLastname: string;
  doctorId?: string;
  doctorName?: string;
  hospitalId?: string;
  hospitalName?: string;
  contratId?: string;
  contratName?: string; // optionnel — sera ajouté côté backend ultérieurement
  typeOrderId?: string;
  typeOrderTitle?: string;
  attribuateDoctorId?: string;
  assignedToUserId?: string;
  /**
   * Nom de la personne à qui le bon a été affecté (page Affectations), ou absent
   * s'il ne l'est pas. Calculé par l'API à partir de la table d'association ;
   * quand un bon figure dans plusieurs affectations, c'est la plus récente.
   */
  assignedUserName?: string;
  option?: boolean;
  /**
   * L'établissement à facturer à la place du patient.
   *
   * Nuls, c'est le patient qui paie — le cas ordinaire. Saisie libre : le
   * laboratoire facture des cliniques qu'il ne reverra pas, et leur créer une
   * fiche à chacune encombrerait un référentiel pour un seul examen.
   */
  factureANom?: string | null;
  factureAAdresse?: string | null;
  factureAIfu?: string | null;
  details: DetailTestOrderDto[];
  branchId: string;
  createdAt: string;
  reportId?: string;
  reportStatus?: string;       // "DRAFT" | "VALIDATED" | "DELIVERED" | "PENDING_REVIEW"
  reportIsDelivered?: boolean;
  invoiceId?: string;
  archive?: string;            // chemin fichier joint
  archiveFileId?: string;      // identifiant du fichier joint (GET /files/{id})
  testAffiliate?: string;      // référence de l'examen (examen de référence Immuno)
}

export interface MySpaceStats {
  totalAssigned: number;
  totalPending: number;
  totalValidated: number;
  totalImmunoPending: number;
  totalUrgent: number;
  totalLate: number;
}

// Dto pour un détail envoyé dans le body de create/update
export interface DetailTestOrderRequestDto {
  labTestId: string;
  price: number;
  discount: number;
}

export interface TestOrderRequest {
  patientId: string;
  prelevementDate: string;
  typeOrderId?: string;
  doctorId?: string;
  hospitalId?: string;
  contratId?: string;
  referenceHopital?: string;
  examenReferenceInput?: string;
  /** Référence de l'examen (examen de référence Immuno) — colonne test_affiliate côté backend. */
  testAffiliate?: string;
  isUrgent?: boolean;
  option?: boolean;
  factureANom?: string | null;
  factureAAdresse?: string | null;
  factureAIfu?: string | null;
  assignedToUserId?: string;
  details?: DetailTestOrderRequestDto[];
}

export const testOrdersApi = {
  findAll: (params?: {
    page?: number;
    size?: number;
    status?: string;
    /** Filtre par statut du compte rendu : NONE / DRAFT / VALIDATED / DELIVERED. */
    reportStatus?: string;
    typeOrderId?: string;
    isUrgent?: boolean;
    /**
     * L'année du dossier, telle que son code la porte — 2026 pour « 26-0155 ».
     *
     * L'année du code et non celle du prélèvement : un prélèvement de décembre
     * enregistré en janvier porte le numéro de la nouvelle année, et c'est bien
     * un dossier de l'année en cours.
     */
    annee?: number;
    /** Ne garder que les dossiers ni remis ni annulés. */
    enCours?: boolean;
    patientId?: string;
    doctorId?: string;
    attribuateDoctorId?: string;
    contratId?: string;
    assignedToMe?: boolean;
    search?: string;
    from?: string;
    to?: string;
  }) => apiClient.get<PageResponse<TestOrder>>("/test-orders", { params }),

  findAllImmuno: (params?: {
    page?: number;
    size?: number;
    status?: string;
    isUrgent?: boolean;
    /**
     * L'année du dossier, telle que son code la porte — 2026 pour « 26-0155 ».
     *
     * L'année du code et non celle du prélèvement : un prélèvement de décembre
     * enregistré en janvier porte le numéro de la nouvelle année, et c'est bien
     * un dossier de l'année en cours.
     */
    annee?: number;
    /** Ne garder que les dossiers ni remis ni annulés. */
    enCours?: boolean;
    patientId?: string;
    doctorId?: string;
    attribuateDoctorId?: string;
    contratId?: string;
    search?: string;
    from?: string;
    to?: string;
  }) => apiClient.get<PageResponse<TestOrder>>("/test-orders/immuno", { params }),

  countImmunoPending: () =>
    apiClient.get<{ count: number }>("/test-orders/immuno/count-pending"),

  /** Badge « Demandes d'examen » : bons cyto/histo en attente de compte rendu. */
  countPending: () =>
    apiClient.get<{ count: number }>("/test-orders/count-pending"),

  findById: (id: string) => apiClient.get<TestOrder>(`/test-orders/${id}`),

  create: (data: TestOrderRequest) =>
    apiClient.post<TestOrder>("/test-orders", data),

  update: (id: string, data: TestOrderRequest) =>
    apiClient.put<TestOrder>(`/test-orders/${id}`, data),

  delete: (id: string) => apiClient.delete(`/test-orders/${id}`),

  // status envoyé en query param (@RequestParam côté backend)
  updateStatus: (testOrderId: string, status?: string) =>
    apiClient.patch(`/test-orders/${testOrderId}/status`, null, {
      params: status ? { status } : undefined,
    }),

  addImages: (testOrderId: string, files: FileList) => {
    const fd = new FormData();
    // @RequestParam("files_name") côté backend
    Array.from(files).forEach((f) => fd.append("files_name", f));
    return apiClient.post(`/test-orders/${testOrderId}/images`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Téléverse la pièce jointe (archive) d'un bon — @RequestParam("archive") côté backend. */
  uploadArchive: (testOrderId: string, file: File) => {
    const fd = new FormData();
    fd.append("archive", file);
    return apiClient.post<{ data: string }>(
      `/test-orders/${testOrderId}/archive`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },

  // retourne List<ImageDto> côté backend
  getImages: (testOrderId: string) =>
    apiClient.get<ImageDto[]>(`/test-orders/${testOrderId}/images`),

  deleteImage: (testOrderId: string, index: number) =>
    apiClient.delete(`/test-orders/${testOrderId}/images/${index}`),

  // Les détails sont gérés via create/update (body) — ces endpoints n'existent pas côté backend
  // addDetail, updateDetail, deleteDetail supprimés

  // @RequestParam labTestId (pas testId) côté backend
  getDiscount: (labTestId: string, contratId: string) =>
    apiClient.get<DiscountDto>(
      `/test-orders/discount`,
      { params: { labTestId, contratId } }
    ),

  // Assigner un médecin anatomopathologiste
  assignDoctor: (id: string, doctorId: string) =>
    apiClient.post(`/test-orders/${id}/assign-doctor`, { doctorId }),

  // Livrer une demande d'examen
  deliver: (id: string) => apiClient.post(`/test-orders/${id}/deliver`),

  // Mon Espace
  getMySpace: () =>
    apiClient.get<MySpaceStats>("/test-orders/myspace/stats"),

  getMyOrders: (params: {
    status: "PENDING" | "VALIDATED" | "DELIVERED" | "CANCELLED";
    typeOrderId?: string;
    priority?: string;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  }) =>
    apiClient.get<PageResponse<TestOrder>>("/test-orders/myspace/orders", {
      params,
    }),
};

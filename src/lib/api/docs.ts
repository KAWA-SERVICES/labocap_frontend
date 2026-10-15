import { toast } from "sonner";
import apiClient from "@/lib/api/client";
import { messageErreurFichier, urlFichier, type RefFichier } from "@/lib/fichiers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Doc {
  id: string;
  title: string;
  attachment: string;
  /** Identifiant du fichier pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  isCurrentVersion?: boolean;
  fileSize?: number;
  documentationCategoryId?: string;
  userId?: string;
  roleId?: string;
  branchId?: string;
  createdAt: string;
}

export interface DocVersion {
  id: string;
  docId: string;
  version: number;
  title?: string;
  attachment: string;
  fileId?: string;
  fileSize?: number;
  userId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Télécharge un fichier joint en passant par apiClient (cookies + refresh token
 * via l'intercepteur), plutôt qu'un `<a href>` direct qui contournerait le
 * rafraîchissement d'authentification (le endpoint /files/** exige un JWT valide).
 * Un 403 (entité non lisible) ou un 404 (fichier rattaché à rien) finit en toast.
 */
export async function downloadDocFile(
  fichier: RefFichier,
  filename?: string
): Promise<void> {
  try {
    const response = await apiClient.get(urlFichier(fichier), {
      responseType: "blob",
    });
    const blob = response.data as Blob;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || fichier.path?.split("/").pop() || "document";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(
      await messageErreurFichier(err, "Échec du téléchargement du fichier"),
    );
  }
}

/**
 * Ouvre un fichier joint dans un nouvel onglet, récupéré via apiClient (cookies)
 * puis exposé en `blob:` — l'URL reste sur le front (jamais le chemin backend) et
 * le CSP strict de l'API ne bloque pas l'aperçu (PDF/images).
 */
export async function openDocFile(fichier: RefFichier): Promise<void> {
  // Ouvrir l'onglet SYNCHRONEMENT (dans le geste de clic), avant tout `await` :
  // sinon le navigateur bloque le popup (window.open après une promesse n'est
  // plus rattaché au geste utilisateur).
  const tab = window.open("about:blank", "_blank");
  try {
    const response = await apiClient.get(urlFichier(fichier), {
      responseType: "blob",
    });
    const blob = response.data as Blob;
    const url = window.URL.createObjectURL(blob);
    if (tab) {
      // Onglet déjà ouvert : on y charge le blob.
      tab.location.href = url;
    } else {
      // Popup bloqué malgré tout → repli sur un téléchargement.
      const a = document.createElement("a");
      a.href = url;
      a.download = fichier.path?.split("/").pop() || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (tab) tab.close();
    toast.error(
      await messageErreurFichier(err, "Échec de l'ouverture du fichier"),
    );
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const docsApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<{ content: Doc[]; totalElements: number; totalPages: number }>(
      "/docs",
      { params }
    ),

  findById: (id: string) => apiClient.get<Doc>(`/docs/${id}`),

  create: (title: string, file: File, documentationCategoryId?: string) => {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("file", file);
    if (documentationCategoryId) fd.append("documentationCategoryId", documentationCategoryId);
    return apiClient.post<Doc>("/docs", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  addVersion: (id: string, file: File, title?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (title) fd.append("title", title);
    return apiClient.post<DocVersion>(`/docs/${id}/versions`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /**
   * Édite le titre d'un document (et remplace optionnellement le fichier, sans
   * nouvelle version). Calque Laravel `doc.update`.
   */
  updateTitle: (id: string, title: string, file?: File | null) => {
    const fd = new FormData();
    fd.append("title", title);
    if (file) fd.append("file", file);
    return apiClient.put<Doc>(`/docs/${id}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Documents d'une catégorie (volet droit de l'explorateur). */
  byCategory: (categoryId: string) =>
    apiClient.get<Doc[]>(`/docs/by-category/${categoryId}`),

  getVersions: (id: string) => apiClient.get<DocVersion[]>(`/docs/${id}/versions`),

  delete: (id: string) => apiClient.delete(`/docs/${id}`),

  /** Corbeille : documents supprimés logiquement. */
  trash: (params?: Record<string, unknown>) =>
    apiClient.get<{ content: Doc[]; totalElements: number; totalPages: number }>(
      "/docs/trash",
      { params }
    ),

  /** Restaure un document depuis la corbeille. */
  restore: (id: string) => apiClient.post<Doc>(`/docs/${id}/restore`),

  /** Suppression définitive d'un document. */
  permanentDelete: (id: string) => apiClient.delete(`/docs/${id}/permanent`),

  // --- GED avancée ---

  /** Partage un document avec un rôle (notifie par email les utilisateurs du rôle). */
  share: (id: string, roleId: string) =>
    apiClient.post<Doc>(`/docs/${id}/share`, { roleId }),

  /** Documents partagés avec l'utilisateur courant (via ses rôles). */
  sharedWithMe: (params?: Record<string, unknown>) =>
    apiClient.get<{ content: Doc[]; totalElements: number; totalPages: number }>(
      "/docs/shared-with-me",
      { params }
    ),

  /** Documents les plus récents. */
  recent: (limit = 5) =>
    apiClient.get<Doc[]>("/docs/recent", { params: { limit } }),
};

// ---------------------------------------------------------------------------
// Documentation Categories
// ---------------------------------------------------------------------------

export interface DocumentationCategory {
  id: string;
  name: string;
  branchId?: string;
}

export interface DocumentationCategoryRequest {
  name: string;
}

export const documentationCategoriesApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<DocumentationCategory[]>("/documentation-categories", { params }),
  create: (data: DocumentationCategoryRequest) =>
    apiClient.post<DocumentationCategory>("/documentation-categories", data),
  update: (id: string, data: DocumentationCategoryRequest) =>
    apiClient.put<DocumentationCategory>(`/documentation-categories/${id}`, data),
  delete: (id: string) => apiClient.delete(`/documentation-categories/${id}`),
};

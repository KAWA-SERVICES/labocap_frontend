import type { AxiosError } from "axios";
import { API_ORIGIN } from "@/lib/api/client";
import { getApiErrorMessageFromBlob } from "@/lib/api/errorMessages";

/**
 * Référence d'un fichier stocké telle que l'API la renvoie : l'identifiant
 * (`fileId`, nouvelle route `GET /files/{id}`) et, pour les clients pas encore
 * basculés, le chemin (`path`, `attachment`, `photoUrl`…). L'un des deux suffit.
 */
export interface RefFichier {
  fileId?: string | null;
  path?: string | null;
}

/**
 * URL absolue d'un fichier servi par le backend. Préfère `/files/{fileId}`
 * quand l'identifiant est là, retombe sur le chemin sinon ; un chemin déjà
 * absolu (http…) est rendu tel quel. Seul endroit du front qui construit une
 * URL `/files/` : l'API répond 403 si la personne n'a pas le droit de lire
 * l'entité propriétaire, 404 si le fichier n'est rattaché à rien.
 */
export function urlFichier({ fileId, path }: RefFichier): string {
  if (fileId) return `${API_ORIGIN}/api/v1/files/${fileId}`;
  const chemin = path ?? "";
  if (/^https?:\/\//.test(chemin)) return chemin;
  return `${API_ORIGIN}/api/v1/files/${chemin.replace(/^\/+/, "")}`;
}

/** Message français d'un échec de lecture de fichier : 403 et 404 ont leur mot. */
export async function messageErreurFichier(err: unknown, fallback: string): Promise<string> {
  const statut = (err as AxiosError).response?.status;
  if (statut === 403) return "Vous n'êtes pas autorisé à consulter ce fichier";
  if (statut === 404) return "Fichier introuvable";
  return getApiErrorMessageFromBlob(err, fallback);
}

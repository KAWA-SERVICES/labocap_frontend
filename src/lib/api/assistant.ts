import apiClient, { API_ORIGIN } from "./client";
import { authApi } from "./auth";
import { translateApiError } from "./errorMessages";
import { clearSelectedBranch, getSelectedBranchId } from "@/lib/branch-cookie";
import { lireSse, type EvenementSse } from "@/lib/assistant-sse";

export type Fournisseur = "ANTHROPIC" | "OPENAI";

export interface EtatAssistant {
  actif: boolean;
  fournisseur: Fournisseur | null;
  modele: string | null;
}

export interface ConversationResume {
  id: string;
  titre: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface DetailConfirmation {
  libelle: string;
  valeur: string;
}

export interface Confirmation {
  callId: string;
  outil: string;
  resume: string;
  details: DetailConfirmation[];
}

export type Bloc =
  | { type: "text"; texte: string }
  | { type: "tool_use"; id: string; nom: string; args: unknown }
  | { type: "tool_result"; callId: string; contenu: unknown; erreur?: boolean };

export interface MessageStocke {
  seq: number;
  role: "user" | "assistant" | "tool";
  blocs: Bloc[];
  /** 1 = 👍, -1 = 👎. */
  avis?: 1 | -1 | null;
}

export interface RapportAssistant {
  id: string;
  debut: string;
  fin: string;
  statistiques: {
    questions: number;
    utilisateurs: number;
    avisPositifs: number;
    avisNegatifs: number;
    jetons: number;
    outils: { outil: string; libelle: string; succes?: number; echec?: number; refuse?: number }[];
    outilsJamaisUtilises: string[];
    besoins: { demande: string; raison: string; le: string }[];
    retoursNegatifs: { question: string; commentaire: string | null }[];
  };
  synthese: string | null;
  createdAt: string;
}

export interface Transcription {
  messages: MessageStocke[];
  enAttente: Confirmation | null;
}

export interface ReglagesAssistant {
  actif: boolean;
  fournisseur: Fournisseur;
  modele: string;
  caviardage: boolean;
  quotaMensuelJetons: number | null;
  cleApiConfiguree: boolean;
  consommeCeMois: number;
}

export interface ReglagesAssistantRequete {
  actif: boolean;
  fournisseur: Fournisseur;
  modele: string;
  caviardage: boolean;
  quotaMensuelJetons: number | null;
  /** Omise : la clé enregistrée est conservée. */
  cleApi?: string;
}

/** Erreur levée avant l'ouverture du flux (4xx/5xx). */
export class ErreurAssistant extends Error {
  constructor(
    public readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = "/assistant";

export const assistantApi = {
  etat: () => apiClient.get<EtatAssistant>(`${BASE}/etat`).then((r) => r.data),
  creerConversation: () =>
    apiClient.post<ConversationResume>(`${BASE}/conversations`, {}).then((r) => r.data),
  conversations: () =>
    apiClient.get<ConversationResume[]>(`${BASE}/conversations`).then((r) => r.data),
  messages: (id: string) =>
    apiClient.get<Transcription>(`${BASE}/conversations/${id}/messages`).then((r) => r.data),
  donnerAvis: (id: string, seq: number, avis: -1 | 0 | 1, commentaire?: string) =>
    apiClient.put(`${BASE}/conversations/${id}/messages/${seq}/avis`, { avis, commentaire }),
  rapports: () => apiClient.get<RapportAssistant[]>(`${BASE}/rapports`).then((r) => r.data),
  genererRapport: () => apiClient.post<RapportAssistant>(`${BASE}/rapports`, {}).then((r) => r.data),
  reglages: () => apiClient.get<ReglagesAssistant>(`${BASE}/reglages`).then((r) => r.data),
  enregistrerReglages: (r: ReglagesAssistantRequete) =>
    apiClient.put<ReglagesAssistant>(`${BASE}/reglages`, r).then((x) => x.data),

  /** Envoie un message ; les événements arrivent au fil de l'eau. */
  envoyer: (id: string, texte: string, surEvenement: (e: EvenementSse) => void, signal?: AbortSignal) =>
    flux(`${BASE}/conversations/${id}/messages`, { texte }, surEvenement, signal),

  /** Confirme ou refuse l'écriture en attente ; la suite du tour arrive en flux. */
  confirmer: (id: string, callId: string, accepter: boolean, surEvenement: (e: EvenementSse) => void, signal?: AbortSignal) =>
    flux(`${BASE}/conversations/${id}/confirmations/${encodeURIComponent(callId)}`, { accepter }, surEvenement, signal),
};

/**
 * POST qui répond en `text/event-stream`.
 *
 * <p>Passe par `fetch` et non par axios : axios ne rend pas le corps au fil de
 * l'eau dans le navigateur. Il faut donc refaire ici ce que fait l'intercepteur
 * de `client.ts` — l'en-tête d'agence, le rafraîchissement du jeton sur 401
 * (une seule fois), le renvoi vers le choix d'agence sur 428.</p>
 */
async function flux(
  chemin: string,
  corps: unknown,
  surEvenement: (e: EvenementSse) => void,
  signal?: AbortSignal,
): Promise<void> {
  const envoyerUneFois = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    const agence = getSelectedBranchId();
    if (agence) headers["X-Branch-Id"] = agence;
    return fetch(`${API_ORIGIN}/api/v1${chemin}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(corps),
      signal,
    });
  };

  let reponse = await envoyerUneFois();
  if (reponse.status === 401) {
    await authApi.refresh(); // l'intercepteur renvoie vers /login si le refresh échoue
    reponse = await envoyerUneFois();
  }
  if (reponse.status === 428) {
    clearSelectedBranch();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- même renvoi que client.ts, hors composant
    window.location.href = "/select-branch";
    throw new ErreurAssistant(428, "Choisissez une agence.");
  }
  if (!reponse.ok || !reponse.body) {
    let message = "";
    try {
      const json = await reponse.json();
      message = translateApiError(json?.message) ?? "";
    } catch {
      // corps vide ou non JSON
    }
    throw new ErreurAssistant(reponse.status, message || messageParStatut(reponse.status));
  }
  await lireSse(reponse.body, surEvenement);
}

function messageParStatut(statut: number): string {
  if (statut === 409) return "Une réponse est déjà en cours dans cette conversation.";
  if (statut === 429) return "Trop de messages d'affilée. Patientez une minute.";
  if (statut === 403) return "Vous n'avez pas accès à l'assistant.";
  return "L'assistant ne répond pas. Réessayez dans un instant.";
}

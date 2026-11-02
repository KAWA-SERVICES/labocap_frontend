import type { AxiosError } from "axios";
import type { ApiError } from "@/types/api";

/**
 * Traductions des codes d'erreur métier renvoyés par le backend (BusinessException).
 * Le backend renvoie un code en MAJUSCULES_SNAKE dans `message` ; on l'affiche en
 * français lisible plutôt que le code brut.
 */
const API_ERROR_MESSAGES: Record<string, string> = {
  CONTRACT_INVOICE_ALREADY_PAID:
    "La facture groupée de ce contrat est déjà payée. Ouvrez une nouvelle facture pour ce contrat avant de valider d'autres examens.",
  CONTRACT_NO_INVOICE:
    "Aucune facture ouverte pour ce contrat. Créez une facture avant de valider l'examen.",
  TEST_ORDER_NO_CONTRACT:
    "Cette demande n'a pas de contrat associé.",
  CODE_GENERATION_CONFLICT:
    "Conflit lors de la génération du code (deux validations simultanées). Réessayez.",
  INVOICE_ALREADY_PAID: "Cette facture est déjà payée.",
  CONTRACT_ALREADY_ACTIVE: "Ce contrat est déjà actif.",
  CATEGORY_DETAIL_ALREADY_EXISTS:
    "Cet examen existe déjà dans cette catégorie.",
  MECEF_DISABLED: "La normalisation MECEF/DGI est désactivée.",
  PATIENT_HAS_ORDERS:
    "Ce patient a des demandes d'examen : suppression impossible.",
  PAYMENT_ALREADY_SUCCESS: "Ce paiement a déjà été effectué avec succès.",
  REFUND_ALREADY_EXISTS: "Un remboursement existe déjà pour cette facture.",
  REFUND_AMOUNT_EXCEEDS_INVOICE:
    "Le montant du remboursement dépasse le total de la facture.",
  TOKEN_PAYMENT_NOT_CONFIGURED: "Le paiement par jeton n'est pas configuré.",
  DICTEE_QUOTA_ATTEINT:
    "Quota mensuel de dictée atteint pour cette agence. Contactez l'administrateur.",
};

/**
 * Traduit un code d'erreur métier en message français. Si la chaîne n'est pas un
 * code connu, elle est renvoyée telle quelle (déjà un message lisible).
 */
export function translateApiError(message?: string | null): string | undefined {
  if (!message) return undefined;
  return API_ERROR_MESSAGES[message] ?? message;
}

/**
 * Extrait et traduit le message d'une erreur Axios, avec repli sur un message
 * générique fourni par l'appelant.
 *
 * Accepte aussi une `Error` simple : certaines mutations rejettent côté client
 * avant tout appel réseau (garde-fous de saisie). Sans ce cas, `err.response`
 * est absent et le message précis est remplacé par le repli générique.
 */
export function getApiErrorMessage(
  err: AxiosError<ApiError> | Error,
  fallback = "Une erreur est survenue"
): string {
  const axiosErr = err as AxiosError<ApiError>;
  const apiMessage = translateApiError(axiosErr.response?.data?.message);
  if (apiMessage) return apiMessage;
  // Erreur non-Axios : son `message` est écrit par nous, donc déjà lisible.
  // Sur une vraie erreur Axios on garde le repli, car `err.message` vaudrait
  // « Request failed with status code 500 ».
  if (!axiosErr.isAxiosError) return err.message || fallback;
  return fallback;
}

/**
 * Variante pour les appels `responseType: "blob"` (PDF, exports).
 *
 * Axios applique le type de réponse demandé à *toutes* les réponses, y compris
 * les erreurs : sur un 422, `response.data` est un Blob et non l'objet JSON.
 * `data.message` vaut donc `undefined` et {@link getApiErrorMessage} retombe sur
 * son repli générique — le message du serveur est perdu alors qu'il est là.
 *
 * C'est ce qui rendait « Erreur lors de la génération du PDF » indéchiffrable :
 * le backend renvoie la cause exacte (`InvalidOperationException`, cf.
 * PdfReportServiceImpl), et le front l'effaçait avant de l'afficher.
 */
export async function getApiErrorMessageFromBlob(
  err: unknown,
  fallback = "Une erreur est survenue"
): Promise<string> {
  const data = (err as AxiosError<ApiError | Blob>).response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as ApiError;
      const message = translateApiError(parsed?.message);
      if (message) return message;
    } catch {
      // Corps vide, non-JSON ou illisible : le repli générique reste préférable
      // à l'affichage d'un fragment brut.
    }
  }
  return getApiErrorMessage(err as AxiosError<ApiError> | Error, fallback);
}

/**
 * Reporte les erreurs de validation du backend sur les champs du formulaire.
 *
 * Le backend renvoie déjà le détail champ par champ :
 * `{ "message": "Erreurs de validation", "data": { "phone": "Numéro invalide…" } }`
 * mais le front n'affichait que `message` dans un toast générique, d'où les
 * « Erreur de validation » sans indication de la cause remontés en recette.
 *
 * @param err     erreur Axios reçue
 * @param setError setter de react-hook-form (`form.setError`)
 * @returns `true` si au moins un champ a reçu son message — l'appelant peut
 *          alors se dispenser du toast.
 */
export function applyFieldErrors(
  err: AxiosError<ApiError>,
  setError: (name: string, error: { type: string; message: string }) => void,
): boolean {
  const details = err.response?.data?.data;
  if (!details || typeof details !== "object") return false;
  let applied = false;
  for (const [field, message] of Object.entries(details as Record<string, unknown>)) {
    if (typeof message === "string" && message.trim() !== "") {
      setError(field, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}

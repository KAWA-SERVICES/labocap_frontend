/**
 * État « challenge 2FA en cours » côté client — équivalent de la session Laravel
 * « authentifié mais `user_2fa` absent » (voir `RedirectIfAuthenticated` et le
 * middleware `tfauth` de l'app Laravel).
 *
 * Trois cookies coexistent pour un même challenge :
 *  - `pending_2fa` : posé par l'API, **HttpOnly**, porte le token temporaire ;
 *    c'est la source de vérité côté serveur (le code ne peut être validé qu'avec lui) ;
 *  - `pending_2fa_until` : posé ici, **lisible**, horodatage d'expiration en ms —
 *    lu par le proxy Next pour verrouiller /login et n'ouvrir /2fa/challenge que
 *    pendant un challenge, et par la page de saisie pour afficher le décompte ;
 *  - `pending_2fa_email` : posé ici, **lisible**, adresse saisie au login
 *    **déjà masquée** (`v…e@caap.bj`), pour l'écran de saisie du code. L'adresse
 *    en clair n'est gardée qu'en mémoire du module, pour le renvoi du code.
 *
 * Le verrou se lève tout seul : les trois cookies ont la durée de vie du code.
 * Aucun n'est nécessaire pour valider le code (l'API lit son cookie HttpOnly),
 * ils ne servent qu'à l'orientation de la navigation et à l'affichage.
 */

export const PENDING_2FA_UNTIL_COOKIE = "pending_2fa_until";
export const PENDING_2FA_EMAIL_COOKIE = "pending_2fa_email";
/**
 * Durée TOTALE de validité du code, en secondes, telle que renvoyée par l'API
 * (`expiresIn` de la réponse de login quand `requires2fa`).
 *
 * Mémorisée parce que `pending_2fa_until` ne porte que l'échéance : la barre de
 * décompte a besoin de la durée initiale pour calculer sa proportion. Sans elle,
 * l'écran devrait la supposer — et se désynchroniserait dès que la validité
 * change côté API (`JwtTokenProvider.TEMP_TOKEN_VALIDITY_MS`).
 */
export const PENDING_2FA_TOTAL_COOKIE = "pending_2fa_total";
/**
 * Canal par lequel le code a été mis à disposition : « APP » ou « EMAIL ».
 *
 * Mémorisé pour que l'écran de saisie se formule juste. Annoncer « code envoyé
 * à v…@caap.bj » à quelqu'un qui n'a rien reçu — parce que son application
 * l'engendre — le ferait attendre un courriel qui ne viendra pas, puis appeler
 * l'assistance.
 */
export const PENDING_2FA_CANAL_COOKIE = "pending_2fa_canal";
/** Cookie HttpOnly posé par l'API — non lisible ici, lu par le proxy serveur. */
export const PENDING_2FA_COOKIE = "pending_2fa";

/** Durée de repli si l'API ne renvoie pas `expiresIn` (token temporaire = 5 min). */
const DEFAULT_TTL_SECONDS = 300;

/**
 * Adresse en clair du challenge en cours, pour `/auth/resend-2fa` qui l'exige.
 * En mémoire seulement : un rechargement de la page la perd, et le bouton
 * « Renvoyer » renvoie alors à la connexion (repli déjà en place).
 */
let emailEnClair: string | null = null;

/** `vincente@caap.bj` → `v…e@caap.bj` : premier et dernier caractère de la partie locale. */
export function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  const masque = local.length <= 2 ? local[0] + "…" : local[0] + "…" + local[local.length - 1];
  return domaine ? `${masque}@${domaine}` : masque;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * Ouvre un challenge : identifiants validés, code envoyé par e-mail. Tant qu'il
 * court, l'écran de connexion est inaccessible et l'écran de saisie du code l'est.
 *
 * @param email     adresse saisie au login (écrite masquée dans le cookie)
 * @param expiresIn durée de validité du code en secondes, telle que renvoyée par l'API
 */
export function beginPending2fa(
  email: string,
  expiresIn?: number | null,
  canal?: string | null,
): void {
  const ttl = expiresIn && expiresIn > 0 ? Math.floor(expiresIn) : DEFAULT_TTL_SECONDS;
  writeCookie(PENDING_2FA_UNTIL_COOKIE, String(Date.now() + ttl * 1000), ttl);
  writeCookie(PENDING_2FA_EMAIL_COOKIE, masquerEmail(email), ttl);
  emailEnClair = email;
  writeCookie(PENDING_2FA_TOTAL_COOKIE, String(ttl), ttl);
  writeCookie(PENDING_2FA_CANAL_COOKIE, canal === "APP" ? "APP" : "EMAIL", ttl);
}

/** Le code est-il attendu depuis l'application d'authentification ? */
export function pending2faParApplication(): boolean {
  return readCookie(PENDING_2FA_CANAL_COOKIE) === "APP";
}

/** Ferme le challenge (code validé, ou expiré côté client). */
export function clearPending2fa(): void {
  emailEnClair = null;
  deleteCookie(PENDING_2FA_UNTIL_COOKIE);
  deleteCookie(PENDING_2FA_EMAIL_COOKIE);
  deleteCookie(PENDING_2FA_TOTAL_COOKIE);
  deleteCookie(PENDING_2FA_CANAL_COOKIE);
}

/** Horodatage (ms) d'expiration du challenge en cours, `null` s'il n'y en a pas. */
export function getPending2faExpiry(): number | null {
  const raw = readCookie(PENDING_2FA_UNTIL_COOKIE);
  if (!raw) return null;
  const until = Number(raw);
  return Number.isFinite(until) ? until : null;
}

/** `true` si un challenge est en cours et non expiré. */
export function hasPending2fa(): boolean {
  const until = getPending2faExpiry();
  return until !== null && until > Date.now();
}

/**
 * Durée totale de validité du code en cours, en millisecondes.
 *
 * Retombe sur {@link DEFAULT_TTL_SECONDS} si le cookie manque — challenge ouvert
 * avant l'introduction de ce cookie, ou effacé. La barre reste alors juste dans
 * l'ordre de grandeur, et le décompte chiffré, lui, est toujours exact puisqu'il
 * découle de l'échéance.
 */
export function getPending2faTotalMs(): number {
  const raw = readCookie(PENDING_2FA_TOTAL_COOKIE);
  const total = Number(raw);
  return Number.isFinite(total) && total > 0
    ? total * 1000
    : DEFAULT_TTL_SECONDS * 1000;
}

/** Adresse e-mail masquée du challenge en cours, à afficher telle quelle ; `null` si aucun. */
export function getPending2faEmail(): string | null {
  return readCookie(PENDING_2FA_EMAIL_COOKIE);
}

/** Adresse en clair pour le renvoi du code ; `null` après rechargement de la page. */
export function getPending2faEmailPourRenvoi(): string | null {
  return emailEnClair;
}

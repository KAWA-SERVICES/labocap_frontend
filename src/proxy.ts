import { NextRequest, NextResponse } from "next/server";
import {
  applyCspHeaders,
  buildCspPolicy,
  CSP_REPORT_PATH,
  generateNonce,
} from "@/lib/security/csp";
import { getEnabledModules, moduleForPath } from "@/lib/modules";

/**
 * Garde de routes côté serveur (Proxy Next.js 16, ex-`middleware`).
 *
 * Assure deux rôles distincts :
 *  1. la garde d'authentification décrite ci-dessous ;
 *  2. la pose de la Content Security Policy, avec un nonce régénéré à chaque
 *     requête (cf. src/lib/security/csp.ts). C'est le seul endroit où un nonce
 *     par requête est possible : la fonction `headers()` de next.config.ts est
 *     statique et s'évalue au build.
 *
 * Première ligne de défense UX : redirige les utilisateurs non authentifiés
 * vers /login avant même le rendu de la page protégée (l'ancien dispositif ne
 * reposait que sur le client — intercepteur 401 + PermissionGate).
 *
 * Gère également l'étape de confirmation par code (2FA) : tant qu'un challenge
 * court, /login est verrouillé et /2fa/challenge est la seule page d'auth
 * accessible ; hors challenge, /2fa/challenge renvoie vers /login.
 *
 * La sécurité réelle reste assurée par l'API (token JWT HttpOnly validé côté
 * Spring Security) ; ici on se contente de vérifier la *présence* du cookie
 * `access_token` (Path=/ donc visible par le proxy) pour orienter la
 * navigation. On ne valide pas la signature : ce n'est pas le rôle du front.
 */

const ACCESS_COOKIE = "access_token";
const BRANCH_COOKIE = "selected_branch_id";
const SELECT_BRANCH_PATH = "/select-branch";
const TWO_FA_PATH = "/2fa/challenge";

// Cookies d'un challenge 2FA en cours (voir src/lib/auth-2fa.ts) : `pending_2fa`
// est posé par l'API (HttpOnly, porte le token temporaire), `pending_2fa_until`
// par le front (horodatage d'expiration). L'un ou l'autre suffit à caractériser
// un challenge en cours — le second garantit la garde même si l'API est servie
// sur un domaine distinct dont les cookies n'atteignent pas le serveur Next.
const PENDING_2FA_COOKIE = "pending_2fa";
const PENDING_2FA_UNTIL_COOKIE = "pending_2fa_until";

// Routes accessibles sans authentification.
const PUBLIC_PATHS = ["/login", "/2fa", "/forgot-password", "/reset-password"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isTwoFaPath(pathname: string): boolean {
  return pathname === TWO_FA_PATH || pathname.startsWith(`${TWO_FA_PATH}/`);
}

/**
 * Un challenge 2FA est-il en cours ? Les cookies expirent d'eux-mêmes avec le
 * code ; l'horodatage est vérifié en plus pour ne pas rester verrouillé si le
 * navigateur conserve un cookie périmé.
 */
function hasPending2fa(request: NextRequest): boolean {
  if (request.cookies.has(PENDING_2FA_COOKIE)) return true;
  const until = Number(request.cookies.get(PENDING_2FA_UNTIL_COOKIE)?.value);
  return Number.isFinite(until) && until > Date.now();
}

/**
 * Applique la garde d'authentification et renvoie l'URL vers laquelle rediriger,
 * ou `null` si la requête peut poursuivre son chemin.
 */
function resolveAuthRedirect(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has(ACCESS_COOKIE);
  const hasBranch = request.cookies.has(BRANCH_COOKIE);
  const pending2fa = hasPending2fa(request);

  // Utilisateur authentifié qui revient sur une page d'auth → renvoyé à l'accueil.
  if (hasToken && isPublic(pathname)) {
    return new URL("/home", request.url);
  }

  // Challenge 2FA en cours (identifiants validés, code envoyé) : reprise de la
  // logique Laravel `RedirectIfAuthenticated` — tant que le code n'a pas expiré,
  // l'écran de connexion (et les autres écrans d'auth) est inaccessible, seule la
  // saisie du code est autorisée.
  if (pending2fa && isPublic(pathname) && !isTwoFaPath(pathname)) {
    return new URL(TWO_FA_PATH, request.url);
  }

  // Inversement, l'écran de saisie du code n'existe QUE pendant un challenge :
  // saisir la route à la main sans avoir validé d'identifiants renvoie au login
  // (analogue du middleware `auth` sur la route `/confirm-login` de Laravel).
  if (!pending2fa && !hasToken && isTwoFaPath(pathname)) {
    return new URL("/login", request.url);
  }

  // Page protégée sans token → redirection vers /login, en mémorisant la cible.
  if (!hasToken && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return loginUrl;
  }

  // Authentifié mais aucune branche sélectionnée → écran de sélection de branche
  // (analogue du middleware `BranchRequired` de Laravel). `/select-branch` et les
  // pages publiques sont exemptés pour ne pas boucler.
  if (
    hasToken &&
    !hasBranch &&
    pathname !== SELECT_BRANCH_PATH &&
    !isPublic(pathname)
  ) {
    return new URL(SELECT_BRANCH_PATH, request.url);
  }

  return null;
}

/**
 * Garde des modules optionnels (cf. src/lib/modules.ts, docs/modules.md) : une
 * route appartenant à un module désactivé renvoie à l'accueil. `APP_MODULES`
 * est relue à chaque requête — comme `CSP_ENFORCE`, elle se bascule par un
 * simple redémarrage du conteneur, sans reconstruire l'image.
 *
 * N'intervient qu'APRÈS la garde d'authentification : un visiteur non connecté
 * est d'abord envoyé au login, comme sur toute autre page protégée.
 */
function resolveModuleRedirect(request: NextRequest): URL | null {
  const appModule = moduleForPath(request.nextUrl.pathname);
  if (appModule && !getEnabledModules().includes(appModule)) {
    return new URL("/home", request.url);
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Le collecteur de violations doit rester joignable sans authentification :
  // le navigateur y poste les rapports hors de toute session, et il ne suivrait
  // de toute façon pas une redirection sur un POST de reporting.
  if (pathname === CSP_REPORT_PATH) {
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const policy = buildCspPolicy(nonce);

  const redirect =
    resolveAuthRedirect(request) ?? resolveModuleRedirect(request);
  if (redirect) {
    const response = NextResponse.redirect(redirect);
    applyCspHeaders(response.headers, policy);
    return response;
  }

  // Le nonce voyage sur les en-têtes de REQUÊTE : Next.js relit la politique au
  // moment du rendu pour apposer le nonce sur ses propres balises (runtime
  // React, chunks de page), et le layout racine le relit via `headers()` pour
  // le transmettre à Emotion (cf. src/components/providers.tsx).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  applyCspHeaders(requestHeaders, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyCspHeaders(response.headers, policy);
  return response;
}

/**
 * Exclut les internes Next.js et les fichiers statiques du proxy :
 * tout `_next`, favicon, et tout chemin contenant une extension de fichier.
 * Les routes des modules (`/biologie/…`, `/agenda`) sont donc bien couvertes.
 *
 * `_next` en entier, et non ses seuls sous-chemins `static` et `image` : le
 * rechargement à chaud ouvre une WebSocket sur `/_next/webpack-hmr`, que le
 * motif précédent laissait passer par le proxy. Celui-ci répondait en HTTP là
 * où le navigateur attendait une poignée de main, d'où « cannot parse
 * response » et un rechargement à chaud muet en développement.
 *
 * Aucun effet en production : `_next` n'y sert que des ressources compilées,
 * qui n'ont rien à faire du proxy — le commentaire d'origine l'annonçait déjà,
 * seul le motif ne le faisait pas.
 */
export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};

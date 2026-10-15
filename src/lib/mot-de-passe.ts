import { z } from "zod";

/** Longueur minimale imposée par l'API (politique de mot de passe, lot 11). */
export const MOT_DE_PASSE_MIN = 12;

/** Règle affichée sous chaque champ de nouveau mot de passe. */
export const REGLE_MOT_DE_PASSE = `Au moins ${MOT_DE_PASSE_MIN} caractères ; ni mot de passe courant, ni votre nom, prénom ou adresse e-mail.`;

/**
 * Contrôle côté client. Les refus plus fins (mot de passe courant, nom, prénom,
 * e-mail) viennent de l'API, qui répond 422 avec un `message` affiché tel quel.
 */
export const motDePasseSchema = z
  .string()
  .min(MOT_DE_PASSE_MIN, `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);

export type ForceMotDePasse = "faible" | "moyen" | "fort";

/**
 * Force indicative : moins de 12 caractères = faible ; 12 et plus = moyen ;
 * 16 et plus avec au moins deux classes de caractères (minuscules, majuscules,
 * chiffres, autres) = fort.
 */
export function forceMotDePasse(mdp: string): ForceMotDePasse {
  if (mdp.length < MOT_DE_PASSE_MIN) return "faible";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(mdp)).length;
  return mdp.length >= 16 && classes >= 2 ? "fort" : "moyen";
}

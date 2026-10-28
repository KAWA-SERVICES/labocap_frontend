// Langues proposées sur la fiche patient.
// Les valeurs sont lues telles quelles par le serveur pour choisir le message
// de l'appel vocal « résultat disponible » (NotificationServiceImpl.callPatient) :
// « fon » et « anglais » ont leur message, toute autre valeur reçoit le français.
// Ne pas les renommer sans changer le serveur.
export const LANGUE_OPTIONS = [
  { value: "français", label: "Français" },
  { value: "fon", label: "Fon" },
  { value: "anglais", label: "Anglais" },
];

export const LANGUE_PAR_DEFAUT = "français";

import { forceMotDePasse, REGLE_MOT_DE_PASSE } from "@/lib/mot-de-passe";

const NIVEAU = { faible: 1, moyen: 2, fort: 3 } as const;
const COULEUR = { faible: "bg-red-500", moyen: "bg-amber-500", fort: "bg-green-600" } as const;

/** Rappel de la règle et barre de force à trois niveaux, sous un champ de nouveau mot de passe. */
export function ForceMotDePasse({ valeur }: { valeur: string }) {
  const force = forceMotDePasse(valeur);
  return (
    <div className="mt-1.5 space-y-1">
      {valeur && (
        <div className="flex items-center gap-2" aria-label={`Force du mot de passe : ${force}`}>
          <div className="flex flex-1 gap-1">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded ${i <= NIVEAU[force] ? COULEUR[force] : "bg-gray-200"}`}
              />
            ))}
          </div>
          <span className="text-xs capitalize text-gray-600">{force}</span>
        </div>
      )}
      <p className="text-xs leading-relaxed text-gray-500">{REGLE_MOT_DE_PASSE}</p>
    </div>
  );
}

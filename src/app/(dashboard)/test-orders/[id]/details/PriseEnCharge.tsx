"use client";

import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";

import { assignmentsApi, type EtapeAffectation } from "@/lib/api/assignments";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

/**
 * À qui la demande a été confiée, dans l'ordre.
 *
 * <h2>Pourquoi la suite entière, et pas seulement les deux noms demandés</h2>
 *
 * Le besoin exprimé est de savoir qui l'avait d'abord et qui l'a maintenant.
 * Ne montrer que ces deux-là suffirait aujourd'hui, où un dossier ne change de
 * mains qu'une fois ; au troisième transfert, le médecin du milieu
 * disparaîtrait sans que rien ne signale qu'on l'a escamoté. La liste complète
 * répond aux deux questions — le premier élément, celui qui est courant — sans
 * mentir sur ce qui s'est passé entre les deux.
 */
export function PriseEnCharge({ demandeId }: { demandeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["historique-affectation", demandeId],
    queryFn: () => assignmentsApi.historique(demandeId).then((r) => r.data),
    enabled: !!demandeId,
  });

  const etapes = data?.etapes ?? [];
  // Le titulaire, et à côté de lui les médecins consultés pour avis : une
  // ligne d'avis est courante elle aussi, sans être celle qui a le dossier.
  const courante = etapes.find(
    (e: EtapeAffectation) => e.remplaceeLe === null && !e.pourAvis,
  );
  const pourAvis = etapes.filter(
    (e: EtapeAffectation) => e.remplaceeLe === null && e.pourAvis,
  );
  const titulaires = etapes.filter((e: EtapeAffectation) => !e.pourAvis);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800">
        <UserRound className="h-4 w-4 text-gray-500" />
        Prise en charge
      </h2>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : etapes.length === 0 ? (
        <p className="text-sm text-gray-500">
          Cette demande n&apos;a pas encore été affectée à un médecin.
        </p>
      ) : (
        <>
          {/* Les deux réponses qu'on vient chercher, avant le détail. Un
              dossier jamais transféré n'a qu'un médecin : répéter son nom sous
              deux étiquettes ferait croire à un transfert. */}
          <dl className="mb-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <dt className="w-40 flex-shrink-0 font-medium text-gray-500">
                Confiée d&apos;abord à :
              </dt>
              <dd className="text-gray-800">{etapes[0].medecin ?? "—"}</dd>
            </div>
            {titulaires.length > 1 && (
              <div className="flex items-start gap-2">
                <dt className="w-40 flex-shrink-0 font-medium text-gray-500">
                  Affectée à :
                </dt>
                <dd className="font-semibold text-gray-800">
                  {courante?.medecin ?? "Personne"}
                </dd>
              </div>
            )}
            {pourAvis.length > 0 && (
              <div className="flex items-start gap-2">
                <dt className="w-40 flex-shrink-0 font-medium text-blue-800">
                  Pour avis :
                </dt>
                <dd className="font-semibold text-blue-900">
                  {pourAvis
                    .map((e: EtapeAffectation) => e.medecin ?? "Médecin inconnu")
                    .join(", ")}
                </dd>
              </div>
            )}
          </dl>

          {etapes.length > 1 && (
            <ol className="space-y-3 border-l border-gray-200 pl-4">
              {etapes.map((etape: EtapeAffectation) => (
                <Etape key={etape.detailId} etape={etape} />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Etape({ etape }: { etape: EtapeAffectation }) {
  const courante = etape.remplaceeLe === null;
  return (
    <li className="relative text-sm">
      {/* Le point de la frise, posé sur le trait plutôt qu'à côté : décalé, il
          se lit comme une puce et la frise perd sa continuité. */}
      <span
        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
          !courante
            ? "bg-gray-300"
            : etape.pourAvis
              ? "bg-blue-600"
              : "bg-green-600"
        }`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={courante ? "font-semibold text-gray-800" : "text-gray-700"}
        >
          {etape.medecin ?? "Médecin inconnu"}
        </span>
        {!courante ? (
          <Badge variant="secondary">Transférée</Badge>
        ) : etape.pourAvis ? (
          <Badge variant="info">Pour avis</Badge>
        ) : (
          <Badge variant="success">En charge</Badge>
        )}
        {etape.codeAffectation && (
          <span className="font-mono text-xs text-gray-500">
            {etape.codeAffectation}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        {etape.confieeLe
          ? `${etape.pourAvis ? "Avis demandé" : "Confiée"} le ${formatDate(etape.confieeLe)}`
          : ""}
        {etape.confieePar ? ` par ${etape.confieePar}` : ""}
        {etape.remplaceeLe
          ? ` — retirée le ${formatDate(etape.remplaceeLe)}`
          : ""}
      </p>
    </li>
  );
}

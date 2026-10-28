"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import type { ColumnDef } from "@tanstack/react-table";

import {
  BadgeCheck,
  ExternalLink,
  FileMinus,
  MessageSquare,
  MessageSquareWarning,
  Pencil,
  ShieldCheck,
} from "lucide-react";

import { CrudModal } from "@/components/common/CrudModal";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { IconButton } from "@/components/ui/IconButton";
import { TextInput } from "@/components/ui/TextInput";
import { usePermissions } from "@/hooks/usePermissions";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { DEFAULT_REPORT_FOOTER } from "@/lib/constants/report";
import {
  invoicesApi,
  type Invoice,
  type InvoiceDetail,
  type InvoiceClientInfoHistory,
  type InvoicePayment,
} from "@/lib/api/invoices";
import { getApiErrorMessageFromBlob } from "@/lib/api/errorMessages";
import type { ApiError } from "@/types/api";

// ---------------------------------------------------------------------------
// Formatage — calqué sur `invoices/show.blade.php`
// ---------------------------------------------------------------------------

/** `number_format(abs($v), 0, ',', ' ')` : millier séparé par une espace. */
function formatMontant(value?: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(Math.abs(value ?? 0))
    .replace(/ | /g, " ");
}

/** `price` et `discount` sont des `double` : PHP les rend sans décimale inutile. */
function formatDouble(value?: number): string {
  if (value == null) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}

/** `total` est un `numeric(10,2)` : PHP le rend toujours avec 2 décimales. */
function formatDecimal2(value?: number): string {
  return (value ?? 0).toFixed(2);
}

/** `$invoice->created_at` s'affiche au format « 2026-07-16 12:58:06 ». */
function formatDateTimeSql(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Helper Laravel `remove_hyphen` : « 26-0005 » → « 260005 ». */
function removeHyphen(code?: string): string {
  return (code ?? "").replace(/-/g, "");
}

/** Une ligne du tableau de la facture, déjà formatée pour l'affichage. */
interface InvoiceLine {
  id: string;
  designation: string;
  /**
   * Le nom du catalogue, quand un libellé personnalisé l'a remplacé.
   *
   * Montré en second sous la désignation : sans lui, on ne saurait plus quel
   * acte a réellement été rendu, et la ligne deviendrait indéchiffrable pour
   * qui la relit six mois plus tard.
   */
  nomDuCatalogue?: string;
  prix: string;
  remise: string;
  total: string;
}

function buildLineColumns(
  onRenommer?: (ligne: InvoiceLine) => void,
): ColumnDef<InvoiceLine>[] {
  return [
  {
    header: "#",
    id: "index",
    enableSorting: false,
    cell: ({ row }) => row.index + 1,
  },
  {
    header: "Désignation",
    accessorKey: "designation",
    cell: ({ row }) => (
      <div>
        <b>{row.original.designation}</b>
        {row.original.nomDuCatalogue && (
          <div className="text-xs text-gray-500">
            au catalogue&nbsp;: {row.original.nomDuCatalogue}
          </div>
        )}
      </div>
    ),
  },
  {
    header: "Quantité",
    id: "quantite",
    enableSorting: false,
    // Laravel affiche toujours 1 : la quantité n'est pas gérée sur les lignes.
    cell: () => "1",
  },
  { header: "Prix", accessorKey: "prix" },
  { header: "Remise", accessorKey: "remise" },
  {
    header: "Total",
    accessorKey: "total",
    cell: ({ row }) => <span className="block text-right">{row.original.total}</span>,
  },
  // La colonne n'existe que si le geste est offert : une colonne d'actions
  // vide sur une facture déjà normalisée laisserait croire à une panne.
  ...(onRenommer
    ? [
        {
          header: "",
          id: "actions",
          enableSorting: false,
          cell: ({ row }: { row: { original: InvoiceLine } }) => (
            <IconButton
              variant="edit"
              title="Modifier le libellé"
              aria-label="Modifier le libellé"
              onClick={() => onRenommer(row.original)}
              icon={<Pencil className="h-4 w-4" />}
            />
          ),
        } as ColumnDef<InvoiceLine>,
      ]
    : []),
  ];
}

/**
 * Longueur exacte du code de la facture normalisée (MECeF/DGI).
 *
 * Règle Laravel (`invoices/show.blade.php`) : l'input porte `minlength="24"` et
 * `maxlength="24"`, et `updateStatus()` refuse la saisie avec « Code normalisé
 * doit être 24 caractères » dès que `code.length < 24 || code.length > 24`.
 */
// Encaissement manuel mis hors service — voir le bloc commenté dans le rendu.
// const CODE_NORMALISE_LENGTH = 24;

/** Une ligne du récapitulatif présenté avant confirmation. */
function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value || "—"}</dd>
    </div>
  );
}

const NOTE_IMPORTANTE =
  "Les résultats de vos analyses seront disponibles dans un délai de 3 semaines. " +
  "Selon la complexité du cas, les résultats peuvent être disponibles plus tôt ou plus tard. " +
  "Vous serez notifiés dès que les résultats seront prêts. Nous vous remercions de votre " +
  "compréhension et de votre patience.";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [payment, setPayment] = useState<InvoicePayment>("ESPECES");
  // Encaissement manuel mis hors service — voir le bloc commenté dans le rendu.
  // const [codeNormalise, setCodeNormalise] = useState("");

  /**
   * Adresser la facture à quelqu'un d'autre que ce qu'elle porte.
   *
   * Fermé par défaut : la facture va au patient dans la très grande majorité
   * des cas, et ouvrir trois champs à chaque déclaration ferait cliquer pour
   * rien. C'est ici et pas ailleurs parce que c'est ici qu'on le découvre —
   * l'agent a la facture sous les yeux, et c'est le dernier instant où elle
   * peut encore changer de nom : une fois partie à la DGI, un document fiscal
   * ne se reprend plus.
   */
  const [changeDestinataire, setChangeDestinataire] = useState(false);
  const [destNom, setDestNom] = useState("");
  const [destAdresse, setDestAdresse] = useState("");
  const [destIfu, setDestIfu] = useState("");

  /** Récapitulatif de confirmation, avant tout envoi à la DGI. */
  const [showNormalizeModal, setShowNormalizeModal] = useState(false);
  /** Récapitulatif de confirmation, avant création de l'avoir. */
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  /** Historique des actualisations du nom/adresse client. */
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  /** La ligne dont on change le libellé, si une modale est ouverte. */
  const [ligneRenommee, setLigneRenommee] = useState<InvoiceLine | null>(null);
  const [libelleSaisi, setLibelleSaisi] = useState("");

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ["invoice", id],
    queryFn: () => invoicesApi.findById(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: clientInfoHistory, isLoading: isHistoryLoading } = useQuery<
    InvoiceClientInfoHistory[]
  >({
    queryKey: ["invoice", id, "client-info-history"],
    queryFn: () => invoicesApi.getClientInfoHistory(id).then((r) => r.data),
    enabled: !!id && showHistoryModal,
  });

  const { data: appSettings } = useAppSettings();
  const reportFooter = appSettings?.report_footer?.trim() || DEFAULT_REPORT_FOOTER;

  // Encaissement manuel mis hors service — voir le bloc commenté dans le rendu.
  // const markPaidMutation = useMutation({
  //   mutationFn: async () => {
  //     // Contrôles identiques à `updateStatus()` de Laravel, dans le même ordre :
  //     // code obligatoire, exactement 24 caractères, puis unicité vérifiée par
  //     // l'API (route `invoices/checkCode`) avant d'encaisser.
  //     const code = codeNormalise.trim();
  //     if (!code) {
  //       throw new Error("Code normalisé requis");
  //     }
  //     if (code.length !== CODE_NORMALISE_LENGTH) {
  //       throw new Error(
  //         `Code normalisé doit être ${CODE_NORMALISE_LENGTH} caractères`,
  //       );
  //     }
  //     const { data: check } = await invoicesApi.checkCode(code);
  //     if (check?.exists) {
  //       throw new Error("Ce Code normalisé existe déjà");
  //     }
  //     return invoicesApi.markAsPaid(id, { payment, code });
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["invoice", id] });
  //     queryClient.invalidateQueries({ queryKey: ["invoices"] });
  //     toast.success("Facture marquée comme payée");
  //   },
  //   onError: (err: Error) => {
  //     // Les refus de saisie sont levés ici même (message déjà formulé) ; les
  //     // erreurs d'API portent le leur dans la réponse.
  //     const apiMessage = (err as AxiosError<ApiError>).response?.data?.message;
  //     toast.error(apiMessage ?? err.message ?? "Erreur lors du paiement");
  //   },
  // });

  /**
   * Ouvre le document de la facture normalisée.
   *
   * Le document est récupéré par le backend, qui seul détient la clé API de
   * FluidInvoice, puis ouvert depuis un blob local — même chemin que « Voir
   * tout » juste en dessous.
   */
  const ouvrirDocumentNormalise = async () => {
    try {
      const res = await invoicesApi.downloadNormalizedDocument(id);
      const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const onglet = window.open(url, "_blank");
      if (!onglet) {
        toast.info(
          "Ouverture bloquée par le navigateur — utilisez « Voir la facture normalisée ».",
        );
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(
        await getApiErrorMessageFromBlob(
          err,
          "Erreur lors de l'ouverture du document normalisé",
        ),
      );
    }
  };

  const normalizedDocAction = useAsyncAction(ouvrirDocumentNormalise);

  /**
   * Normalisation DGI.
   *
   * Le document s'ouvre dans un nouvel onglet dès la première normalisation.
   * L'ouverture peut être refusée par le bloqueur de fenêtres — elle survient
   * après un aller-retour réseau, donc hors du geste utilisateur qui l'a
   * déclenchée. On le dit alors explicitement : le bouton « Voir la facture
   * normalisée », désormais présent, reste le chemin d'accès au document.
   */
  const renommerMutation = useMutation({
    mutationFn: () =>
      invoicesApi
        .changerLibelleDeLigne(id, ligneRenommee!.id, libelleSaisi)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      setLigneRenommee(null);
      toast.success("Libellé mis à jour");
    },
    onError: (err: AxiosError<ApiError>) => {
      const apiMessage = err.response?.data?.message;
      toast.error(apiMessage ?? err.message ?? "Erreur lors de la mise à jour");
    },
  });

  const normalizeMutation = useMutation({
    mutationFn: () =>
      invoicesApi
        // Un avoir n'encaisse pas : lui envoyer un mode n'aurait aucun sens.
        // Une facture déjà réglée garde le sien, le serveur ignore celui-ci.
        .normalize(
          id,
          isAvoir ? undefined : payment,
          changeDestinataire && destNom.trim()
            ? {
                nom: destNom.trim(),
                adresse: destAdresse.trim() || undefined,
                ifu: destIfu.trim() || undefined,
              }
            : undefined,
        )
        .then((r) => r.data),
    onSuccess: (normalized: Invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setShowNormalizeModal(false);
      toast.success("Facture normalisée");

      if (normalized?.normalizedUrl) {
        void ouvrirDocumentNormalise();
      }
    },
    onError: (err: Error) => {
      const apiMessage = (err as AxiosError<ApiError>).response?.data?.message;
      toast.error(apiMessage ?? err.message ?? "Erreur lors de la normalisation");
    },
  });

  /**
   * Envoi du SMS de la facture normalisée, quand l'envoi automatique n'est
   * jamais parti (passerelle en panne au moment de la normalisation, numéro
   * ajouté depuis). Le serveur refuse un second SMS : le bouton disparaît dès
   * que la date d'envoi revient.
   */
  const smsMutation = useMutation({
    mutationFn: () => invoicesApi.envoyerSms(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("SMS envoyé au patient");
    },
    onError: (err: Error) => {
      // Un refus « déjà parti » vient d'un envoi fait ailleurs : relire la
      // facture retire le bouton.
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      const apiMessage = (err as AxiosError<ApiError>).response?.data?.message;
      toast.error(apiMessage ?? err.message ?? "SMS non envoyé");
    },
  });

  /** Création de l'avoir. La facture d'origine reste intacte. */
  const creditNoteMutation = useMutation({
    mutationFn: () => invoicesApi.createCreditNote(id).then((r) => r.data),
    onSuccess: (avoir: Invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setShowCreditNoteModal(false);
      toast.success(`Facture d'avoir ${avoir?.code ?? ""} créée`);
    },
    onError: (err: Error) => {
      const apiMessage = (err as AxiosError<ApiError>).response?.data?.message;
      toast.error(apiMessage ?? err.message ?? "Erreur lors de la création de l'avoir");
    },
  });

  /**
   * Réécrit le nom/adresse client de la facture avec les informations
   * courantes du patient rattaché. Déclenchement volontaire uniquement : la
   * facture ne se met jamais à jour toute seule.
   */
  const refreshClientInfoMutation = useMutation({
    mutationFn: () => invoicesApi.refreshClientInfo(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Informations client actualisées");
    },
    onError: (err: Error) => {
      const apiMessage = (err as AxiosError<ApiError>).response?.data?.message;
      toast.error(apiMessage ?? err.message ?? "Erreur lors de l'actualisation");
    },
  });

  /** « Voir tout » : ouvre le document complet en PDF. */
  const pdfAction = useAsyncAction(async () => {
    try {
      const res = await invoicesApi.downloadPdf(id);
      const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(
        await getApiErrorMessageFromBlob(
          err,
          "Erreur lors de la génération du PDF",
        ),
      );
    }
  });

  if (!can(PERMISSIONS.VIEW_INVOICES)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">Accès non autorisé</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500">Facture introuvable.</p>
      </div>
    );
  }

  const isAvoir = invoice.statusInvoice === 1;
  const refund = invoice.refund;

  /**
   * Une facture normalisée l'est définitivement : le lien du document fait foi.
   * Il commande le basculement « Normaliser » → « Voir la facture normalisée ».
   */
  const isNormalized = Boolean(invoice.normalizedUrl);

  /** Facture normalisée de vente dont le SMS au patient n'est jamais parti. */
  const smsAEnvoyer = isNormalized && !isAvoir && !invoice.shareSmsSentAt;

  /**
   * La facture a-t-elle été déclarée, par l'un ou l'autre parcours ?
   *
   * Deux chemins coexistent : la saisie manuelle héritée de Laravel, qui pose
   * `codeNormalise`, et la passerelle, qui pose `normalizedUrl` et `codeMecef`.
   * Ne regarder que le second retirerait le bouton d'avoir aux milliers de
   * factures déclarées avant la bascule — alors que le serveur, lui, les
   * accepte. L'écran serait plus strict que la règle, sans le dire.
   */
  const estDeclaree =
    isNormalized ||
    Boolean(invoice.codeMecef?.trim()) ||
    Boolean(invoice.codeNormalise?.trim());

  // Le geste n'est offert ni sur un avoir — dont la ligne n'a pas
  // d'identifiant — ni sur une facture déjà déclarée : le papier et la
  // déclaration à la DGI portent le même libellé, et les faire diverger après
  // coup ne se rattrape que par un avoir.
  const peutRenommer =
    !isAvoir && !isNormalized && can(PERMISSIONS.EDIT_INVOICES);
  const canEditInvoices = can(PERMISSIONS.EDIT_INVOICES);

  /**
   * Le nom/adresse client de la facture sont figés au moment de l'émission
   * (voir InvoicePdfServiceImpl côté backend). `patientName`/`patientAddress`,
   * eux, sont recalculés en direct depuis le patient rattaché à chaque
   * lecture : leur divergence signale que le patient a été modifié depuis.
   */
  const nameChanged = Boolean(
    invoice.patientId && invoice.patientName && invoice.patientName !== invoice.clientName,
  );
  const addressChanged = Boolean(
    invoice.patientId && invoice.patientAddress && invoice.patientAddress !== invoice.clientAddress,
  );
  const clientInfoOutdated = nameChanged || addressChanged;

  /** Phrase d'alerte, accordée : "Le nom a été modifié" / "L'adresse a été
   * modifiée" / "Le nom et l'adresse ont été modifiés". */
  const champsModifies = [
    ...(nameChanged ? ["le nom"] : []),
    ...(addressChanged ? ["l'adresse"] : []),
  ];
  const sujetPhrase = champsModifies.length
    ? champsModifies.join(" et ").replace(/^./, (c) => c.toUpperCase())
    : "";
  const verbeModifie =
    champsModifies.length > 1
      ? "ont été modifiés"
      : addressChanged
        ? "a été modifiée"
        : "a été modifié";

  /**
   * Lignes du tableau. Un avoir n'en porte qu'une, reprenant la raison du
   * remboursement ; une facture de vente liste ses prestations.
   */
  const lines: InvoiceLine[] = refund
    ? [
        {
          id: "refund",
          designation: refund.reasonDescription ?? "",
          prix: formatDouble(refund.montant),
          remise: "0.0 ",
          total: formatDouble(refund.montant),
        },
      ]
    : (invoice.details ?? []).map((item: InvoiceDetail) => ({
        id: item.id,
        designation: item.customTestName?.trim() || item.testName,
        nomDuCatalogue: item.customTestName?.trim() ? item.testName : undefined,
        prix: formatDouble(item.price),
        remise: formatDouble(item.discount),
        total: formatDecimal2(item.total),
      }));

  // Titre : « Reçu de paiement de {code demande} » ou « Facture d'avoir ».
  const title =
    (isAvoir ? "Facture d'avoir" : "Reçu de paiement") +
    (invoice.testOrderCode ? ` de ${invoice.testOrderCode}` : "");

  // Le bloc d'encaissement n'apparaît que sur une facture impayée.
  // Encaissement manuel mis hors service — voir le bloc commenté dans le rendu.
  // const showPaymentBlock = !invoice.paid && can(PERMISSIONS.VIEW_CASHIER);

  return (
    <div className="space-y-6">
      {/* `page-title-box` de `invoices/show.blade.php` : le titre dépend du
          statut (« Reçu de paiement » / « Facture d'avoir ») et porte le code de
          la demande. Le bouton « Voir tout » (PDF) prend le `page-title-right`. */}
      <PageHeader
        title={title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Une fois normalisée, la facture ne propose plus que l'accès au
                document : la renvoyer produirait un second document fiscal. */}
            {/* Le SMS ne part qu'une fois : le bouton n'est là que tant
                qu'aucun n'est parti. */}
            {smsAEnvoyer && canEditInvoices && (
              <Button
                variant="secondary"
                icon={<MessageSquare className="h-4 w-4" />}
                onClick={() => smsMutation.mutate()}
                loading={smsMutation.isPending}
              >
                Envoyer le SMS
              </Button>
            )}

            {isNormalized ? (
              <Button
                variant="secondary"
                icon={<ExternalLink className="h-4 w-4" />}
                onClick={normalizedDocAction.run}
                loading={normalizedDocAction.pending}
              >
                Voir la facture normalisée
              </Button>
            ) : (
              canEditInvoices && (
                <Button
                  variant="secondary"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  onClick={() => setShowNormalizeModal(true)}
                >
                  Normaliser la facture
                </Button>
              )
            )}

            {/* L'avoir contrepasse une déclaration.
                Il n'a pas de sens sur un avoir, ni sur une facture que la DGI
                n'a jamais vue : tant que rien n'est déclaré, il n'y a rien à
                contrepasser, et l'on corrige plutôt qu'on émet un second
                document fiscal répondant à un premier inexistant.
                Le serveur le refuse aussi — le bouton caché n'est que la
                moitié du travail. */}
            {!isAvoir && estDeclaree && canEditInvoices && (
              <Button
                variant="secondary"
                icon={<FileMinus className="h-4 w-4" />}
                onClick={() => setShowCreditNoteModal(true)}
              >
                Créer une facture d&apos;avoir
              </Button>
            )}

            <Button onClick={pdfAction.run} loading={pdfAction.pending}>
              Voir tout
            </Button>
          </div>
        }
      />

      {/* Le nom/adresse client de la facture sont figés à l'émission ; ce
          bandeau signale que le patient a changé depuis, sans jamais mettre
          la facture à jour tout seul — seul le bouton Actualiser le fait. */}
      {clientInfoOutdated && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-300 bg-blue-100 p-4 text-sm text-blue-900">
          <div>
            <p className="font-medium">
              {sujetPhrase} du patient {verbeModifie}, depuis l&apos;émission
              de cette facture.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {nameChanged && (
                <li>
                  Nom : <strong>{invoice.clientName || "—"}</strong> →{" "}
                  <strong>{invoice.patientName}</strong>
                </li>
              )}
              {addressChanged && (
                <li>
                  Adresse : <strong>{invoice.clientAddress || "—"}</strong> →{" "}
                  <strong>{invoice.patientAddress}</strong>
                </li>
              )}
            </ul>
            <p className="mt-1">
              Voulez-vous actualiser{" "}
              {champsModifies.length > 1 ? "ces informations" : "cette information"}{" "}
              sur la facture ?
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEditInvoices && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => refreshClientInfoMutation.mutateAsync()}
              >
                Actualiser
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
            >
              Voir l&apos;historique
            </Button>
          </div>
        </div>
      )}

      {/* Récapitulatif avant envoi à la DGI. La normalisation est irréversible :
          l'utilisateur doit voir ce qu'il engage avant de confirmer. */}
      <CrudModal
        isOpen={showNormalizeModal}
        onClose={() => setShowNormalizeModal(false)}
        title="Normaliser la facture"
        submitLabel="Confirmer la normalisation"
        isSubmitting={normalizeMutation.isPending}
        onSubmit={() => normalizeMutation.mutate()}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Vérifiez ces informations : une facture normalisée ne peut plus
            l&apos;être une seconde fois.
          </p>
          {/* Le mode part avec la déclaration : le serveur encaisse d'abord,
              puis déclare. Sans lui, la DGI recevrait une facture annoncée non
              réglée — et un encaissement ultérieur ne la corrigerait pas. */}
          {!isAvoir && !invoice.paid && (
            <div>
              <label
                htmlFor="mode-normalisation"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Mode de paiement
              </label>
              <NativeSelect
                id="mode-normalisation"
                value={payment}
                onChange={(e) => setPayment(e.target.value as InvoicePayment)}
              >
                <option value="ESPECES">ESPECES</option>
                <option value="MOBILEMONEY">MOBILE MONEY</option>
                <option value="CHEQUES">CHEQUES</option>
                <option value="VIREMENT">VIREMENT</option>
              </NativeSelect>
              <p className="mt-1 text-xs text-gray-500">
                La facture sera encaissée puis déclarée : la caisse de vente est
                créditée du montant total.
              </p>
            </div>
          )}
          {/* Le destinataire, modifiable jusqu'au dernier instant. Saisie libre :
              le laboratoire facture des cliniques qu'il ne reverra pas, et leur
              créer une fiche à chacune encombrerait un référentiel pour un seul
              examen. */}
          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={changeDestinataire}
                onChange={(e) => {
                  setChangeDestinataire(e.target.checked);
                  if (e.target.checked && !destNom) {
                    setDestNom(invoice.clientName ?? "");
                    setDestAdresse(invoice.clientAddress ?? "");
                    setDestIfu(invoice.clientIfu ?? "");
                  }
                }}
                className="mt-1"
              />
              <span>
                Facturer à un autre destinataire
                <span className="mt-0.5 block text-xs text-gray-500">
                  Une clinique qui règle pour son patient, par exemple. Ce nom
                  part avec la déclaration à la DGI.
                </span>
              </span>
            </label>

            {changeDestinataire && (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="dest-nom"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Nom ou raison sociale
                  </label>
                  <input
                    id="dest-nom"
                    type="text"
                    value={destNom}
                    onChange={(e) => setDestNom(e.target.value)}
                    maxLength={150}
                    placeholder="CLINIQUE LA PROVIDENCE"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="dest-adresse"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Adresse
                  </label>
                  <input
                    id="dest-adresse"
                    type="text"
                    value={destAdresse}
                    onChange={(e) => setDestAdresse(e.target.value)}
                    placeholder="Cotonou, Ganhi"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="dest-ifu"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    IFU <span className="font-normal text-gray-500">(facultatif)</span>
                  </label>
                  <input
                    id="dest-ifu"
                    type="text"
                    value={destIfu}
                    onChange={(e) => setDestIfu(e.target.value)}
                    maxLength={50}
                    placeholder="3201900123456"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Identifie l&apos;acheteur auprès de la DGI. Un patient
                    n&apos;en a pas ; une clinique, si.
                  </p>
                </div>
              </div>
            )}
          </div>

          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <RecapRow label="Type" value={isAvoir ? "Facture d'avoir" : "Facture de vente"} />
            <RecapRow label="Code" value={invoice.code ?? ""} />
            <RecapRow label="Date" value={formatDateTimeSql(invoice.createdAt)} />
            <RecapRow
              label="Facturé à"
              value={
                changeDestinataire && destNom.trim()
                  ? destNom.trim()
                  : invoice.clientName ?? ""
              }
            />
            <RecapRow label="Nombre de lignes" value={String(lines.length)} />
            <RecapRow
              label="Montant TTC"
              value={`${formatMontant(Number(invoice.total ?? 0))} FCFA`}
            />
          </dl>
        </div>
      </CrudModal>

      {/* Récapitulatif avant création de l'avoir. */}
      <CrudModal
        isOpen={showCreditNoteModal}
        onClose={() => setShowCreditNoteModal(false)}
        title="Créer une facture d'avoir"
        submitLabel="Créer l'avoir"
        isSubmitting={creditNoteMutation.isPending}
        onSubmit={() => creditNoteMutation.mutate()}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            L&apos;avoir est l&apos;opération inverse de cette vente. Il
            s&apos;enregistre comme une facture distincte : la facture
            d&apos;origine reste intacte.
          </p>
          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <RecapRow label="Facture contrepassée" value={invoice.code ?? ""} />
            <RecapRow label="Client" value={invoice.clientName ?? ""} />
            <RecapRow
              label="Montant de l'avoir"
              value={`${formatMontant(Number(invoice.total ?? 0))} FCFA`}
            />
          </dl>
        </div>
      </CrudModal>

      {/* Historique des actualisations du nom/adresse client, depuis la
          table d'audit `invoice_client_info_history` : qui, quand, avant/après. */}
      <CrudModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Historique des actualisations"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowHistoryModal(false)}>
              Fermer
            </Button>
          </div>
        }
      >
        {isHistoryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-gray-200" />
            ))}
          </div>
        ) : !clientInfoHistory || clientInfoHistory.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune actualisation n&apos;a encore été effectuée sur cette
            facture.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Par</th>
                  <th className="pb-2 pr-4">Nom</th>
                  <th className="pb-2">Adresse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientInfoHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                      {formatDateTimeSql(h.createdAt)}
                    </td>
                    <td className="py-2 pr-4">{h.userFullName ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {h.oldClientName || "—"} → {h.newClientName || "—"}
                    </td>
                    <td className="py-2">
                      {h.oldClientAddress || "—"} → {h.newClientAddress || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CrudModal>

      {/* ---- Document ---- */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Filet de tête (comme le <hr> du reçu Laravel) */}
        <hr className="border-gray-200" />

        {/* En-tête : facture · client · QR */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Colonne 1 — la facture */}
          <div className="space-y-2 text-[15px] text-gray-700">
            <p>
              <strong>{isAvoir ? "Facture d'avoir" : "Facture de vente"}</strong>
            </p>
            <p>
              <strong>Date: </strong> {formatDateTimeSql(invoice.createdAt)}
            </p>
            <p>
              <strong>Code: </strong>
              <span>{isAvoir ? (refund?.code ?? "") : invoice.code}</span>{" "}
              <span className="font-bold uppercase">
                {invoice.paid ? "[Payé]" : "[En attente]"}
              </span>
            </p>
            <p>
              {/* Calque Laravel (show.blade) : une facture de vente affiche
                  « Contrat » (nom du contrat tarifaire), un avoir affiche
                  « Référence » (code de la facture d'origine). */}
              {isAvoir ? (
                <>
                  <strong>Référence: </strong>
                  <span>{refund?.invoiceCode ?? invoice.referenceCode ?? ""}</span>
                </>
              ) : (
                <>
                  <strong>Contrat: </strong>
                  <span>{invoice.contratName ?? ""}</span>
                </>
              )}
            </p>
            <p>
              <strong>CODE MECeF / DGI: </strong>
              <span className="uppercase"> {invoice.codeNormalise ?? ""}</span>
            </p>
            {/* Le flow demande qu'une facture normalisée le dise d'elle-même :
                sans ce libellé, l'absence du bouton « Normaliser » se lirait
                comme un droit manquant plutôt que comme une opération faite. */}
            {isNormalized && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[.8rem] font-medium text-green-700">
                <BadgeCheck className="h-4 w-4" />
                Facture déjà normalisée
              </p>
            )}
            {isNormalized && !isAvoir && (
              invoice.shareSmsSentAt ? (
                <p className="flex items-center gap-1.5 text-[.8rem] text-green-700">
                  <MessageSquare className="h-4 w-4" />
                  SMS au patient : envoyé le {formatDateTime(invoice.shareSmsSentAt)}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-[.8rem] text-amber-700">
                  <MessageSquareWarning className="h-4 w-4" />
                  SMS au patient : non envoyé
                </p>
              )
            )}
          </div>

          {/* Colonne 2 — le destinataire */}
          <div className="space-y-2 text-[15px] text-gray-700">
            <p>
              <strong>Adressée à:</strong>
            </p>
            <p>
              {/* Nom figé au moment de l'émission : un document comptable ne
                  change pas tout seul. Voir le bandeau en haut de page s'il a
                  divergé du patient actuel. */}
              <strong>Nom: </strong> {invoice.clientName ?? ""}
            </p>
            <p>
              {/* Adresse figée au moment de l'émission, idem. */}
              <strong>Adresse: </strong>
              <span>{invoice.clientAddress ?? ""}</span>
            </p>
            <p>
              <strong>Code client: </strong>
              <span className="uppercase">{invoice.patientCode ?? ""}</span>
            </p>
            <p>
              {/* « Contact client » : téléphone(s) du patient lié (la facture n'a
                  pas de colonne telephone en base migrée). */}
              <strong>Contact client: </strong>
              <span>{invoice.clientContact ?? " "}</span>
            </p>
            <p>
              <strong>Demande d&apos;examen: </strong>
              <span>{removeHyphen(invoice.testOrderCode)}</span>
            </p>
          </div>

          {/* Colonne 3 — QR code de la facture, sur la même ligne que l'en-tête */}
          <div className="flex justify-end">
            {invoice.qrcode ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  invoice.qrcode.startsWith("data:")
                    ? invoice.qrcode
                    : `data:image/png;base64,${invoice.qrcode}`
                }
                alt="QR Code"
                width={150}
                height={150}
              />
            ) : null}
          </div>
        </div>

        {/* Lignes de la facture — rendu par le DataTable de l'application */}
        <div className="mt-4">
          <DataTable
            columns={buildLineColumns(
              peutRenommer
                ? (ligne) => {
                    setLigneRenommee(ligne);
                    // On repart du libellé affiché : corriger une faute de
                    // frappe ne doit pas obliger à tout retaper.
                    setLibelleSaisi(
                      ligne.nomDuCatalogue ? ligne.designation : "",
                    );
                  }
                : undefined,
            )}
            data={lines}
            hideToolbar
            hideToolbarSearch
          />
        </div>

        {/* Totaux, alignés à droite */}
        <div className="mt-3 flex justify-end">
          <div className="w-64 text-sm text-gray-700">
            <p className="flex justify-between">
              <b>Sous-total : </b>
              <span>{formatMontant(invoice.subtotal)}</span>
            </p>
            <p className="mt-1 text-right">
              <b>Montant TTC : </b>
              {formatMontant(invoice.total)}
            </p>
          </div>
        </div>

        {/* Encaissement manuel — mis hors service.

            La normalisation encaisse elle-même et enregistre le code rendu
            par FluidInvoice : ressaisir ici ce que le serveur sait déjà ne
            servait plus. Conservé en commentaire le temps de vérifier
            qu'aucun cas ne l'exige encore ; à supprimer ensuite.

        {showPaymentBlock && (
          <div className="mt-4 grid grid-cols-1 items-end gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Type de paiement
              </label>
              <NativeSelect
                value={payment}
                onChange={(e) => setPayment(e.target.value as InvoicePayment)}
              >
                <option value="ESPECES">ESPECES</option>
                <option value="MOBILEMONEY">MOBILE MONEY</option>
                <option value="CHEQUES">CHEQUES</option>
                <option value="VIREMENT">VIREMENT</option>
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Code de la facture normalisée
              </label>
              <input
                type="text"
                value={codeNormalise}
                onChange={(e) => setCodeNormalise(e.target.value)}
                placeholder="Code MECeF/DGI"
                minLength={CODE_NORMALISE_LENGTH}
                maxLength={CODE_NORMALISE_LENGTH}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {codeNormalise.trim().length}/{CODE_NORMALISE_LENGTH} caractères
              </p>
            </div>

            <div>
              <Button
                onClick={() => markPaidMutation.mutate()}
                loading={markPaidMutation.isPending}
                icon={<Wallet className="h-4 w-4" />}
                className="bg-green-600 hover:bg-green-700 hover:shadow-[0_2px_6px_0_rgba(10,207,151,0.5)]"
              >
                Terminer la facture
              </Button>
            </div>
          </div>
        )}
        */}

        {/* Note importante */}
        <div className="mt-10 border border-black">
          <p className="m-0 p-1 text-sm text-gray-800">
            <b>Note importante :</b> {NOTE_IMPORTANTE}
          </p>
        </div>

        {/* Pied de page du laboratoire */}
        {reportFooter ? (
          <p className="mt-8 text-center text-xs text-gray-600">{reportFooter}</p>
        ) : null}
      </div>
        <CrudModal
          isOpen={ligneRenommee !== null}
          onClose={() => setLigneRenommee(null)}
          title="Libellé de la ligne"
          size="md"
          onSubmit={() => renommerMutation.mutateAsync()}
          submitLabel="Enregistrer"
          isSubmitting={renommerMutation.isPending}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Ce libellé remplace le nom du catalogue sur la facture imprimée et
              dans la déclaration à la DGI. Le nom du catalogue reste enregistré.
            </p>
            <div>
              <label
                htmlFor="libelle-ligne"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Libellé{" "}
                <span className="font-normal text-gray-500">
                  — vide pour revenir au nom du catalogue
                </span>
              </label>
              <TextInput
                id="libelle-ligne"
                value={libelleSaisi}
                maxLength={100}
                placeholder={
                  ligneRenommee?.nomDuCatalogue ?? ligneRenommee?.designation ?? ""
                }
                onChange={(e) => setLibelleSaisi(e.target.value)}
              />
            </div>
          </div>
        </CrudModal>
    </div>

  );
}

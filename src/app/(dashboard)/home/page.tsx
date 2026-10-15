"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  BarChart2,
  CalendarIcon,
  Eye,
  FileText,
  FlaskConical,
  Folder,
  Printer,
  SquareArrowOutUpRight,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { IconButton } from "@/components/ui/IconButton";

import { usePermissions } from "@/hooks/usePermissions";
import { cn, formatCFA, formatDate } from "@/lib/utils";
import {
  dashboardApi,
  ReportToday,
  RevenueData,
  AppointmentItem,
  DoctorOrder,
} from "@/lib/api/dashboard";
import { PERMISSIONS } from "@/lib/constants/permissions";
import apiClient from "@/lib/api/client";
import { reportsApi } from "@/lib/api/reports";
import { getApiErrorMessageFromBlob } from "@/lib/api/errorMessages";
import { Button } from "@/components/ui/Button";
import {
  CHART_CATEGORICAL,
  CHART_GRID,
  CHART_STATUS,
} from "@/lib/ui/chartColors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Carte du tableau de bord — `.hyper-card` du système.
 *
 * Portait auparavant `rounded-lg` + bordure grise + `shadow-sm`, une définition
 * locale qui avait divergé de celle du reste de l'application : les cartes du
 * tableau de bord n'avaient ni le même rayon ni la même élévation que celles
 * des écrans de liste, sur l'écran justement le plus regardé.
 */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`hyper-card ${className}`}>{children}</div>;
}

/**
 * En-tête de carte.
 *
 * Casse normale : les titres en majuscules à fort interlettrage sont un
 * marqueur Bootstrap explicitement abandonné par le système, et ils dégradent
 * la lisibilité des libellés longs (« EXAMENS LES PLUS DEMANDÉS »). Les appels
 * passent toujours le libellé en majuscules — on le normalise ici plutôt que de
 * réécrire trente chaînes, et le Blade reste la référence du libellé lui-même.
 */
function CardHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-100 px-6 py-4">
      <h2 className="hyper-card-heading !mb-0">{sentenceCase(title)}</h2>
    </div>
  );
}

/**
 * « EXAMENS LES PLUS DEMANDÉS » → « Examens les plus demandés ».
 *
 * Les sigles métier (CA, TVA, CR) restent en capitales : les remettre en bas de
 * casse les rendrait méconnaissables.
 */
const ACRONYMS = new Set(["CA", "TVA", "CR", "HT", "TTC"]);

function sentenceCase(label: string): string {
  const words = label.toLocaleLowerCase("fr").split(" ");
  return words
    .map((word, i) => {
      const upper = word.toLocaleUpperCase("fr");
      if (ACRONYMS.has(upper)) return upper;
      if (i === 0) return upper.charAt(0) + word.slice(1);
      return word;
    })
    .join(" ");
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="px-3 py-2">
          <Skeleton className={`h-3 ${j % 3 === 2 ? "w-1/2" : "w-4/5"}`} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Puce d'action de ligne (tableaux du tableau de bord).
 *
 * Les six actions — « Compte rendu », « CR terminé », « Imprimer », « Voir
 * Facture », « Créer Facture » — étaient stylées une par une, en `rounded`
 * (0.25rem, le rayon Hyper abandonné) et sur l'échelle `bg-*-100 / text-*-800`.
 * C'est précisément la combinaison que `Badge` corrige : à ce palier, le
 * contraste tombe sous 3:1 en petite taille. On reprend donc son échelle —
 * fond 50, texte 700/800, liseré 200 — et le rayon des contrôles.
 *
 * La teinte reste porteuse de sens (ambre : compte rendu ; vert : facturation),
 * elle n'est donc pas remplacée par une variante neutre du kit.
 *
 * `shadow-none` est nécessaire sur les deux `Button` : le kit pose une élévation
 * au survol, superflue sur une puce de 24px de haut posée dans une cellule.
 */
function actionChip(tone: "report" | "invoice"): string {
  return cn(
    "inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1",
    "text-xs font-semibold ring-1 ring-inset shadow-none hover:shadow-none",
    "transition-colors duration-[var(--duration-fast)] ease-emphasized",
    tone === "report"
      ? "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100"
      : "bg-green-50 text-green-800 ring-green-200 hover:bg-green-100",
  );
}

// ---------------------------------------------------------------------------
// ActionButtons — boutons actions pour la table des comptes rendu
// ---------------------------------------------------------------------------

interface ActionButtonsProps {
  report: ReportToday;
  onDeleted: () => void;
}

function ActionButtons({ report, onDeleted }: ActionButtonsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await apiClient.delete(`/reports/${report.id}`);
      onDeleted();
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  };

  /**
   * Ouvre le PDF du compte rendu — équivalent de la route Laravel `report.pdf`.
   *
   * L'ancien lien pointait sur `/reports/{id}/print`, une route qui n'existe pas
   * dans `src/app` : le bouton renvoyait une 404.
   */
  const handlePrintReport = async () => {
    setIsPrinting(true);
    try {
      const res = await reportsApi.downloadPdf(report.id);
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(
        await getApiErrorMessageFromBlob(
          err,
          "Erreur lors de la génération du PDF",
        ),
      );
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCreateInvoice = async () => {
    try {
      const res = await apiClient.post<{ id: string }>(
        `/invoices/from-order/${report.id}`
      );
      router.push(`/invoices/${res.data.id}`);
    } catch {
      // handled globally
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {report.status !== 1 && (
        <>
          <Link
            href={`/test-orders/${report.testOrderId}/details`}
            className={actionChip("report")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Compte rendu (nouvel onglet)"
          >
            <FileText className="h-3.5 w-3.5" />
            Compte rendu
            <SquareArrowOutUpRight aria-hidden="true" className="h-3 w-3 opacity-70" />
          </Link>
          <IconButton
            variant="delete"
            title="Supprimer"
            aria-label="Supprimer"
            onClick={() => setConfirmOpen(true)}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </>
      )}

      {report.status === 1 && (
        <>
          <Link
            href={`/reports/${report.id}`}
            className={actionChip("report")}
          >
            <FileText className="h-3.5 w-3.5" />
            CR terminé
          </Link>
          <Button
            onClick={handlePrintReport}
            disabled={isPrinting}
            className={actionChip("report")}
          >
            <Printer className="h-3.5 w-3.5" />
            {isPrinting ? "Génération…" : "Imprimer"}
          </Button>
        </>
      )}

      {report.invoiceId ? (
        <Link
          href={`/invoices/${report.invoiceId}`}
          className={actionChip("invoice")}
        >
          <Eye className="h-3.5 w-3.5" />
          Voir Facture
        </Link>
      ) : (
        <Button
          onClick={handleCreateInvoice}
          className={actionChip("invoice")}
        >
          Créer Facture
        </Button>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer ce compte rendu"
        message="Cette action est irréversible. Voulez-vous vraiment supprimer ce compte rendu ?"
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DonutChart — générique
// ---------------------------------------------------------------------------

interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

/**
 * Donut générique.
 *
 * Une part non nulle mais minuscule (3 factures d'avoir sur 12 418, soit
 * 0,02 %) trace un arc de 0,09° : invisible à l'écran. La légende annonce
 * alors quatre couleurs alors que le donut n'en montre que deux, ce qui se lit
 * comme un bug de couleurs. On dessine donc chaque part non nulle avec un arc
 * plancher (`minSlicePercent` du total), tout en gardant la valeur réelle pour
 * l'infobulle et pour la légende.
 *
 * L'anneau est plein : ni `paddingAngle` ni contour blanc entre les parts. Le
 * seul blanc visible est le trou central du donut ; tout le reste de la
 * couronne appartient à une couleur de la légende.
 */
function DonutChart({
  segments,
  minSlicePercent = 3,
}: {
  segments: DonutSegment[];
  minSlicePercent?: number;
}) {
  const filtered = segments.filter((s) => s.value > 0);
  if (filtered.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-4">Aucune donnée</p>
    );
  }
  const total = filtered.reduce((sum, s) => sum + s.value, 0);
  const floor = (total * minSlicePercent) / 100;
  const data = filtered.map((s) => ({ ...s, arc: Math.max(s.value, floor) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="arc"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={0}
        >
          {data.map((entry, i) => (
            // Contour de la couleur de la part : sans lui, recharts trace un
            // liseré blanc par défaut entre deux secteurs adjacents.
            <Cell
              key={i}
              fill={entry.color}
              stroke={entry.color}
              strokeWidth={1}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name, item) => {
            const real = (item?.payload as DonutSegment | undefined)?.value;
            return [real ?? value, name];
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// RevenueLineChart
// ---------------------------------------------------------------------------

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * Courbe du chiffre d'affaires, calquée sur le `#revenue-chart` de Laravel :
 * deux séries lissées (semaine actuelle / précédente) sur les jours Lun→Dim,
 * axe des ordonnées en milliers, légende masquée (les deux libellés sont déjà
 * affichés au-dessus du graphique).
 *
 * Les points sont placés d'après la DATE renvoyée par l'API et non d'après leur
 * rang : une série incomplète ne peut donc pas décaler la courbe.
 */
function RevenueLineChart({ data }: { data: RevenueData }) {
  /** Total du jour de la semaine (0 = lundi) pour une série. */
  const byWeekday = (serie: RevenueData["currentWeekByDay"]) => {
    const totals = Array<number>(7).fill(0);
    for (const point of serie ?? []) {
      // `date` est un jour ISO (YYYY-MM-DD) : on le lit en UTC pour que le
      // fuseau local ne fasse pas basculer le point sur la veille.
      const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      totals[(day + 6) % 7] = point.total ?? 0; // dimanche (0) → index 6
    }
    return totals;
  };

  const current = byWeekday(data.currentWeekByDay);
  const previous = byWeekday(data.lastWeekByDay);
  const chartData = WEEK_DAYS.map((day, i) => ({
    name: day,
    actuelle: current[i],
    precedente: previous[i],
  }));

  // Semaine sans encaissement : sans échelle imposée, l'axe afficherait cinq
  // graduations « 0k » identiques. On lui donne alors une amplitude par défaut.
  const maxValue = Math.max(...current, ...previous, 0);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
          domain={[0, maxValue > 0 ? "auto" : 4000]}
          // Format « k » comme Laravel, avec une décimale au besoin : sans elle,
          // une échelle courte afficherait deux graduations « 2k » identiques.
          tickFormatter={(v) =>
            `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(
              Number(v) / 1000,
            )}k`
          }
        />
        <Tooltip formatter={(v) => formatCFA(Number(v))} />
        <Line
          type="monotone"
          dataKey="actuelle"
          stroke={CHART_CATEGORICAL[0]}
          strokeWidth={2}
          dot={false}
          name="Semaine actuelle"
        />
        <Line
          type="monotone"
          dataKey="precedente"
          stroke={CHART_CATEGORICAL[1]}
          strokeWidth={2}
          dot={false}
          name="Semaine précédente"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// SimpleCalendar
// ---------------------------------------------------------------------------

function SimpleCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=dim
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];
  const dayNames = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

  // Build grid cells (leading empty + day numbers)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="text-sm">
      <p className="text-center font-semibold text-gray-700 mb-2">
        {monthNames[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {dayNames.map((d) => (
          <div
            key={d}
            className="text-xs font-semibold text-gray-400 py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`text-xs py-1 rounded ${
              cell === null
                ? ""
                : cell === today.getDate()
                  ? "bg-blue-500 text-white font-bold"
                  : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {cell ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const { can } = usePermissions();

  // L'API refuse (403) toutes les routes `/dashboard/**` sans `view-dashboard` :
  // on n'en appelle aucune, et on le dit — même forme que la page Finance.
  if (!can(PERMISSIONS.VIEW_DASHBOARD)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-gray-500">Accès non autorisé.</p>
      </div>
    );
  }

  return <TableauDeBord />;
}

function TableauDeBord() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const isAdmin = can(PERMISSIONS.VIEW_ADMIN_DASHBOARD);
  // Chiffre d'affaires et état des factures : `view-dashboard-finance` côté API.
  const isFinance = can(PERMISSIONS.VIEW_DASHBOARD_FINANCE);
  const isSecretary = can(PERMISSIONS.VIEW_SECRETARIAT_DASHBOARD);
  const isPathologist = can(PERMISSIONS.VIEW_PATHOLOGIST_DASHBOARD);

  // -- Admin stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => dashboardApi.getStats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  // -- Compteurs opérationnels (bons sans CR, retards). Endpoint distinct de
  // `/dashboard/stats`, qui ne renvoie que des cumuls depuis toujours.
  const { data: opStats, isLoading: opStatsLoading } = useQuery({
    queryKey: ["dashboard", "secretariat-stats"],
    queryFn: () => dashboardApi.getSecretariatStats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isAdmin || isSecretary,
  });

  // -- Reports today
  const { data: reportsToday = [], isLoading: reportsTodayLoading } = useQuery({
    queryKey: ["dashboard", "reports-today"],
    queryFn: () => dashboardApi.getReportsToday().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isSecretary || isAdmin,
  });

  const reportsDelivered = useMemo(
    () => reportsToday.filter((r) => r.isDeliver),
    [reportsToday]
  );




  // -- Finance
  const { data: revenueData } = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: () => dashboardApi.getRevenueData().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isFinance,
  });

  const { data: invoiceStatus } = useQuery({
    queryKey: ["dashboard", "invoice-status"],
    queryFn: () => dashboardApi.getInvoiceStatus().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isFinance,
  });

  // Segments du donut FACTURES — source unique du donut et de sa légende, dans
  // l'ordre et les couleurs du `data-colors` de dashboardPlus.blade.php.
  const invoiceSegments: DonutSegment[] = [
    {
      name: "Factures de vente payées",
      value: invoiceStatus?.invoicePaid ?? 0,
      color: CHART_CATEGORICAL[0],
    },
    {
      name: "Factures de vente non payées",
      value: invoiceStatus?.invoiceNoPaid ?? 0,
      color: CHART_CATEGORICAL[1],
    },
    {
      name: "Factures d'avoir payées",
      value: invoiceStatus?.refundPaid ?? 0,
      color: CHART_CATEGORICAL[2],
    },
    {
      name: "Factures d'avoir non payées",
      value: invoiceStatus?.refundNoPaid ?? 0,
      color: CHART_CATEGORICAL[3],
    },
  ];
  const invoiceSegmentsTotal = invoiceSegments.reduce((s, x) => s + x.value, 0);

  /** Part d'un segment, sans jamais afficher « 0,0 % » pour un compteur non nul. */
  const invoiceShare = (value: number) => {
    if (invoiceSegmentsTotal === 0) return "—";
    const pct = (value / invoiceSegmentsTotal) * 100;
    if (value > 0 && pct < 0.1) return "< 0,1 %";
    return `${pct.toFixed(1).replace(".", ",")} %`;
  };



  // -- Pathologist
  const { data: doctorExamStatus } = useQuery({
    queryKey: ["dashboard", "doctor-exam-status"],
    queryFn: () => dashboardApi.getDoctorExamStatus().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isPathologist,
  });

  const { data: doctorOrders = [], isLoading: doctorOrdersLoading } = useQuery(
    {
      queryKey: ["dashboard", "doctor-orders"],
      queryFn: () => dashboardApi.getDoctorOrders().then((r) => r.data),
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      enabled: isPathologist,
    }
  );

  const { data: doctorOrdersToday = [], isLoading: doctorOrdersTodayLoading } =
    useQuery({
      queryKey: ["dashboard", "doctor-orders-today"],
      queryFn: () => dashboardApi.getDoctorOrdersToday().then((r) => r.data),
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      enabled: isPathologist,
    });

  const { data: doctorAppointments = [] } = useQuery({
    queryKey: ["dashboard", "doctor-appointments"],
    queryFn: () => dashboardApi.getDoctorAppointments().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isPathologist,
  });

  // ExamStatusChart ne renvoie que deux compteurs (termine / enAttente) :
  // on alimente le donut avec ces deux valeurs réelles, sans segment factice.
  const doctorPieData = [
    {
      name: "Terminé",
      value: doctorExamStatus?.termine ?? 0,
      color: CHART_STATUS.good,
    },
    {
      name: "En attente",
      value: doctorExamStatus?.enAttente ?? 0,
      color: CHART_STATUS.critical,
    },
  ];

  // Pagination des tableaux du tableau de bord dont la liste n'est pas bornée.
  const reportsDeliveredPagination = useTablePagination(reportsDelivered, 10);
  const doctorOrdersPagination = useTablePagination(doctorOrders, 10);
  const doctorOrdersTodayPagination = useTablePagination(doctorOrdersToday, 10);

  const doctorOrdersTermine = doctorOrders.filter(
    (o) => o.reportStatus === 1
  ).length;
  const doctorOrdersTotal = doctorOrders.length;

  // Productivité = taux d'examens terminés sur le total affecté au pathologiste.
  // Calculée à partir des compteurs réels déjà chargés (doctorExamStatus) ;
  // affiche "—" si aucune donnée n'est disponible (plutôt qu'un "0 ↑" trompeur).
  const doctorExamsTotal =
    (doctorExamStatus?.termine ?? 0) + (doctorExamStatus?.enAttente ?? 0);
  const doctorProductivite =
    doctorExamsTotal > 0
      ? Math.round(((doctorExamStatus?.termine ?? 0) / doctorExamsTotal) * 100)
      : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" />

      {/* ==================================================================
          ZONES OPÉRATIONNELLES — administrateur ET secrétariat

          Les rôles composaient jusqu'ici par empilement : `{isAdmin && …}`
          puis `{isSecretary && …}` puis `{isDoctor && …}`, chacun apportant
          ses rangées. Un utilisateur à deux rôles recevait donc les deux blocs
          bout à bout, et personne n'avait d'écran pensé pour lui.

          Ce qui relève de l'exploitation quotidienne — ce qu'il reste à faire,
          et le travail du jour — est désormais commun aux deux profils. Les
          analyses cumulées restent réservées à l'administrateur.
      ================================================================== */}
      {(isAdmin || isSecretary) && (
        <>
          {/* ════════════════════════════════════════════════════════════════
              BLOC MÉTRIQUES — une seule surface

              Les indicateurs formaient deux grilles de cartes séparées par la
              liste de travail : huit ombres portées, deux gouttières, aucune
              lecture d'ensemble. Réunis ici en une seule carte découpée par des
              filets d'un pixel (`gap-px` sur fond gris), ils se lisent comme un
              tableau de bord et non comme huit vignettes.

              La hiérarchie est conservée par le traitement, pas par la distance :
                — rangée haute, « à traiter » : cliquable, valeur pleine, icône
                  teintée. Ce sont les chiffres qui appellent une action ;
                — rangée basse, cumuls : inerte, valeur atténuée, tendance en
                  pastille. Des repères, pas des signaux.
          ════════════════════════════════════════════════════════════════ */}
          <Card className="overflow-hidden">
            {/* Le périmètre, dit une fois pour les quatre.
                Ces chiffres portent sur l'année en cours : ils comptaient
                jusqu'ici tout l'historique et disaient surtout l'arriéré —
                331 bons sans compte rendu, dont 237 antérieurs à cette année.
                Le suffixe répété sur chaque titre aurait allongé quatre
                libellés pour une seule information. */}
            <div className="flex items-baseline justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-800">À traiter</h2>
              <span className="text-xs font-medium text-gray-500">
                Année {new Date().getFullYear()}
              </span>
            </div>

            {/* Rangée « à traiter » */}
            <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-4">
              {opStatsLoading || statsLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white p-5">
                      <Skeleton className="mb-3 h-3 w-2/3" />
                      <Skeleton className="h-7 w-1/2" />
                    </div>
                  ))
                : [
                    {
                      title: "Bons sans compte rendu",
                      value: opStats?.noSaveTest ?? 0,
                      href: "/test-orders",
                      icon: <FileText className="h-5 w-5" />,
                      alert: false,
                    },
                    // Seule tuile issue de `/dashboard/stats`, réservé au profil
                    // administrateur : un secrétariat y lirait un zéro permanent.
                    ...(isAdmin
                      ? [
                          {
                            title: "Comptes rendus à valider",
                            value: stats?.noFinishTest ?? 0,
                            href: "/reports",
                            icon: <FlaskConical className="h-5 w-5" />,
                            alert: false,
                          },
                        ]
                      : []),
                    {
                      title: "À remettre au client",
                      value: opStats?.noFinishTest ?? 0,
                      href: "/reports/suivi",
                      icon: <Folder className="h-5 w-5" />,
                      alert: false,
                    },
                    {
                      // Au-delà de trois semaines, un bon en attente est une
                      // anomalie. Teinté seulement s'il y en a : un écran où
                      // tout est rouge n'alerte plus.
                      title: "En retard (> 3 semaines)",
                      value: opStats?.noFinishWeek ?? 0,
                      href: "/test-orders",
                      icon: <AlertTriangle className="h-5 w-5" />,
                      alert: true,
                    },
                  ].map((kpi) => {
                    const isAlert = kpi.alert && kpi.value > 0;
                    return (
                      <Link
                        key={kpi.title}
                        href={kpi.href}
                        className="group bg-white p-5 transition-colors duration-[var(--duration-fast)] ease-emphasized hover:bg-blue-50/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[.8125rem] font-medium text-gray-500">
                            {kpi.title}
                          </p>
                          <span
                            className={cn(
                              "flex-shrink-0 rounded-[var(--radius-control)] p-2",
                              isAlert
                                ? "bg-red-50 text-red-600"
                                : "bg-blue-50 text-blue-600",
                            )}
                          >
                            {kpi.icon}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.02em]",
                            isAlert ? "text-red-600" : "text-gray-900",
                          )}
                        >
                          {kpi.value.toLocaleString("fr-FR")}
                        </p>
                      </Link>
                    );
                  })}
            </div>

            {/* Rangée « volumes cumulés » — réservée à l'administrateur, seul
                profil pour lequel `/dashboard/stats` répond. */}
            {isAdmin && (
              <div className="grid grid-cols-1 gap-px border-t border-gray-200 bg-gray-100 sm:grid-cols-2 xl:grid-cols-4">
                {statsLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="bg-gray-50/60 p-4">
                        <Skeleton className="mb-2 h-3 w-1/2" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    ))
                  : [
                      { title: "Patients", value: (stats?.valeurPatient ?? 0).toLocaleString("fr-FR"), trend: stats?.crPatient },
                      { title: "Clients pro.", value: (stats?.valeurClient ?? 0).toLocaleString("fr-FR"), trend: stats?.crClient },
                      { title: "Demandes d'examen", value: (stats?.valeurTestOrder ?? 0).toLocaleString("fr-FR"), trend: stats?.crTestOrder },
                      { title: "Chiffre d'affaires", value: formatCFA(stats?.valeurInvoice ?? 0), trend: stats?.crInvoice },
                    ].map((kpi) => (
                      <div key={kpi.title} className="bg-gray-50/60 p-4">
                        <p className="truncate text-[.75rem] font-medium uppercase tracking-[0.04em] text-gray-500">
                          {kpi.title}
                        </p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="truncate text-[1.0625rem] font-semibold tracking-[-0.01em] text-gray-700">
                            {kpi.value}
                          </span>
                          {kpi.trend !== undefined && (
                            <span
                              className={cn(
                                "inline-flex flex-shrink-0 items-center gap-0.5 rounded-[var(--radius-control)] px-1.5 py-0.5 text-[.6875rem] font-semibold",
                                kpi.trend >= 0
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-700",
                              )}
                            >
                              {kpi.trend >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {Math.round(kpi.trend)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ==================================================================
          LIGNE PLEINE LARGEUR — le travail du jour

          Un tableau ne se met pas en demi-colonne : ses colonnes (date, code,
          patient, actions) s'y compriment et sa hauteur ne s'accorde à rien.
          Ce qui ne tient pas dans une moitié d'écran prend sa propre ligne,
          avant le bloc à deux colonnes.
      ================================================================== */}
      {(isAdmin || isSecretary) && (
        <>
        {/* ════════════════════════════════════════════════════════════════
            ZONE 2 — LE TRAVAIL DU JOUR
            Remontée depuis la section « secrétariat », où elle était la seule
            vraie liste de travail de l'écran — et invisible aux profils
            administrateur, qui n'avaient donc aucune action à portée de clic.
            Les données étaient pourtant déjà chargées pour eux
            (`enabled: isSecretary || isAdmin`) : seul l'affichage était filtré.
        ════════════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader title="Comptes rendu disponible aujourd'hui" />
          <TableLengthControl pagination={reportsDeliveredPagination} className="px-6" />
          <div className="overflow-x-auto px-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                    Date
                  </th>
                  <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                    Code
                  </th>
                  <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                    Patients
                  </th>
                  <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportsTodayLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonRow key={i} cols={4} />
                  ))
                ) : reportsDelivered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <EmptyState
                        compact
                        icon={FileText}
                        title="Aucun compte rendu aujourd'hui"
                        description="Les comptes rendus disponibles du jour s'afficheront ici."
                      />
                    </td>
                  </tr>
                ) : (
                  reportsDeliveredPagination.pageRows.map((report: ReportToday) => (
                    <tr
                      key={report.id}
                      className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                    >
                      <td className="py-2 px-3 text-gray-600">
                        {formatDate(report.createdAt)}
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        {report.code}
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        {report.patientLastname} {report.patientFirstname}
                      </td>
                      <td className="py-2 px-3">
                        <ActionButtons
                          report={report}
                          onDeleted={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["dashboard", "reports-today"],
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePaginationFooter pagination={reportsDeliveredPagination} className="px-6 pb-5" />
        </Card>
        </>
      )}

      {/* ==================================================================
          DEUX COLONNES — éléments de gabarit comparable

          N'y figure que ce qui s'équilibre : les deux lectures financières.
          Y placer le tableau du jour laissait une colonne s'arrêter à
          mi-hauteur pendant que l'autre continuait.
      ================================================================== */}
      {isFinance && (
        <>
        {/* LIGNE 4 : CHIFFRE D'AFFAIRES + FACTURES */}
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          {/* Gauche col-8 : CHIFFRE D'AFFAIRES */}
          <div>
            <Card>
              <CardHeader title="CHIFFRE D'AFFAIRES" />
              <div className="p-5">
                {/* Bandeau des deux totaux hebdomadaires — calque du bloc
                    `chart-content-bg` de Laravel : libellé au-dessus, montant en
                    gros précédé d'une puce de la couleur de la série. */}
                <div className="rounded bg-gray-50 py-3">
                  <div className="grid grid-cols-1 text-center sm:grid-cols-2">
                    <div>
                      <p className="mb-0 mt-3 text-sm text-gray-500">
                        Semaine actuelle
                      </p>
                      <p className="mb-3 text-2xl font-normal text-gray-900">
                        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600 align-middle" />
                        {formatCFA(revenueData?.totalCurrentWeek ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-0 mt-3 text-sm text-gray-500">
                        Semaine précédente
                      </p>
                      <p className="mb-3 text-2xl font-normal text-gray-900">
                        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-green-600 align-middle" />
                        {formatCFA(revenueData?.totalLastWeek ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Total du jour + accès aux relevés (bouton Laravel
                    « View Statements », classe btn-outline-primary). */}
                <div className="mt-4 mb-4">
                  <h5 className="mb-2 text-base font-semibold text-gray-800">
                    Aujourd&apos;hui: {formatCFA(revenueData?.totalToday ?? 0)}
                  </h5>
                  <Link
                    href="/invoices/business"
                    className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-blue-600 px-[.9rem] py-[.45rem] text-[.9rem] font-medium text-blue-600 transition-colors duration-[var(--duration-fast)] ease-emphasized hover:bg-blue-600 hover:text-white"
                  >
                    Voir les relevés
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                {/* Graphique ligne */}
                {revenueData ? (
                  <RevenueLineChart data={revenueData} />
                ) : (
                  <div className="h-[220px] animate-pulse rounded bg-gray-100" />
                )}
              </div>
            </Card>
          </div>
  
          {/* Droite col-4 : FACTURES */}
          <div>
            <Card>
              <CardHeader title="FACTURES" />
              <div className="p-5">
                {invoiceStatus ? (
                  <>
                    <DonutChart segments={invoiceSegments} />
                    {/* Légende — mêmes couleurs et même ordre que les segments
                        du donut, la part exacte compensant l'arc plancher. */}
                    <div className="space-y-2 mt-3">
                      {invoiceSegments.map((segment) => (
                        <div
                          key={segment.name}
                          className="flex items-center gap-2 text-xs text-gray-600"
                        >
                          <span
                            className="h-3 w-3 rounded-sm inline-block shrink-0"
                            style={{ backgroundColor: segment.color }}
                          />
                          <span className="flex-1 leading-tight">
                            {segment.name}
                          </span>
                          <span className="text-gray-400 whitespace-nowrap">
                            {invoiceShare(segment.value)}
                          </span>
                          <span className="font-semibold text-gray-800 w-12 text-right">
                            {segment.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-[200px] animate-pulse rounded bg-gray-100" />
                )}
              </div>
            </Card>
          </div>
        </div>
        </>
      )}

      {/* ==================================================================
          SECTION PATHOLOGISTE
      ================================================================== */}
      {isPathologist && (
        <>
          {/* LIGNE 7 : widget-inline (total demandes + productivité) */}
          <Card>
            {/* Calque du `card widget-inline` de Laravel : deux colonnes de même
                largeur, contenu centré, icône discrète au-dessus de la valeur et
                filet de séparation entre les deux. */}
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="p-5 text-center">
                <Folder className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {doctorOrdersTotal}
                </p>
                <p className="mb-0 text-[15px] text-gray-500">
                  Total de demandes d&apos;examen affectées
                </p>
              </div>
              <div className="border-t border-gray-200 p-5 text-center sm:border-l sm:border-t-0">
                <BarChart2 className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-2 inline-flex items-center gap-1 text-3xl font-semibold text-gray-900">
                  {doctorProductivite ?? 0}
                  {doctorProductivite !== null && "%"}
                  <ArrowUp className="h-5 w-5 text-green-500" />
                </p>
                <p className="mb-0 text-[15px] text-gray-500">Productivité</p>
              </div>
            </div>
          </Card>

          {/* LIGNE 8 : Status d'examens + Demande affectées */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Gauche col-4 : Status d'examens */}
            <div className="lg:w-5/12">
              <Card>
                <CardHeader title="Status d'examens" />
                <div className="p-5">
                  <DonutChart segments={doctorPieData} />
                  <div className="flex justify-around mt-3">
                    <div className="text-center">
                      <p className="text-green-600 font-semibold text-lg">
                        ↑ {doctorExamStatus?.termine ?? 0}
                      </p>
                      <p className="text-xs text-gray-500">Terminé</p>
                    </div>
                    <div className="text-center">
                      <p className="text-red-600 font-semibold text-lg">
                        ↓ {doctorExamStatus?.enAttente ?? 0}
                      </p>
                      <p className="text-xs text-gray-500">En attente</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Droite col-8 : Demande affectées */}
            <div className="lg:flex-1">
              <Card>
                <CardHeader title="Demande affectées" />
                <div className="px-5 pt-3 pb-1">
                  <p className="text-sm text-gray-600 mb-3">
                    <strong>{doctorOrdersTermine}</strong> Demandes d&apos;examen terminées sur{" "}
                    {doctorOrdersTotal}
                  </p>
                </div>
                <TableLengthControl pagination={doctorOrdersPagination} className="px-6" />
                <div className="overflow-x-auto px-3">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Date
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Code
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Patient
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Compte rendu
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {doctorOrdersLoading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonRow key={i} cols={4} />
                          ))
                        : doctorOrdersPagination.pageRows.map((order: DoctorOrder) => (
                            <tr
                              key={order.id}
                              className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                            >
                              <td className="py-2 px-3 text-gray-600">
                                {formatDate(order.createdAt)}
                              </td>
                              <td className="py-2 px-3">
                                <Link
                                  href={`/test-orders/${order.id}/details`}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Demande ${order.code} (nouvel onglet)`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {order.code}
                                  <SquareArrowOutUpRight aria-hidden="true" className="h-3 w-3 opacity-70" />
                                </Link>
                              </td>
                              <td className="py-2 px-3 text-gray-700">
                                {order.patientLastname} {order.patientFirstname}
                              </td>
                              <td className="py-2 px-3">
                                {order.reportStatus === 1 ? (
                                  <Badge variant="success">Terminé</Badge>
                                ) : (
                                  <Badge variant="warning">En attente</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
                <TablePaginationFooter pagination={doctorOrdersPagination} className="px-6 pb-5" />
              </Card>
            </div>
          </div>

          {/* LIGNE 9 : Activités récentes + Calendrier */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Gauche col-6 : Activités récentes */}
            <div className="flex-1">
              <Card>
                <CardHeader title="Activités récentes" />
                <TableLengthControl pagination={doctorOrdersTodayPagination} className="px-6" />
                <div className="overflow-x-auto px-3">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Date
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Code
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Patient
                        </th>
                        <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                          Compte rendu
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {doctorOrdersTodayLoading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonRow key={i} cols={4} />
                          ))
                        : doctorOrdersToday.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-4 px-3 text-center text-gray-400 text-sm"
                            >
                              Aucune activité aujourd&apos;hui
                            </td>
                          </tr>
                        ) : (
                          doctorOrdersTodayPagination.pageRows.map((order: DoctorOrder) => (
                            <tr
                              key={order.id}
                              className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                            >
                              <td className="py-2 px-3 text-gray-600">
                                {formatDate(order.createdAt)}
                              </td>
                              <td className="py-2 px-3">
                                <Link
                                  href={`/test-orders/${order.id}/details`}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Demande ${order.code} (nouvel onglet)`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {order.code}
                                  <SquareArrowOutUpRight aria-hidden="true" className="h-3 w-3 opacity-70" />
                                </Link>
                              </td>
                              <td className="py-2 px-3 text-gray-700">
                                {order.patientLastname}{" "}
                                {order.patientFirstname}
                              </td>
                              <td className="py-2 px-3">
                                {order.reportStatus === 1 ? (
                                  <Badge variant="success">Terminé</Badge>
                                ) : (
                                  <Badge variant="warning">En attente</Badge>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                    </tbody>
                  </table>
                </div>
                <TablePaginationFooter pagination={doctorOrdersTodayPagination} className="px-6 pb-5" />
              </Card>
            </div>

            {/* Droite col-6 : Calendrier */}
            <div className="flex-1">
              <Card>
                <CardHeader title="Calendrier" />
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Gauche 7/12 : calendrier */}
                    <div className="sm:w-7/12">
                      <SimpleCalendar />
                    </div>
                    {/* Droite 5/12 : liste rendez-vous */}
                    <div className="sm:w-5/12 space-y-3">
                      {doctorAppointments.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          Aucun rendez-vous
                        </p>
                      ) : (
                        doctorAppointments.map(
                          (appt: AppointmentItem) => (
                            <div
                              key={appt.id}
                              className="border border-gray-100 rounded p-3 space-y-1"
                            >
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                <span>
                                  {new Date(appt.date).toLocaleDateString(
                                    "fr-FR"
                                  )}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                Patient : {appt.patientName}
                              </p>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-600">
                                  Priorité:{" "}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                                    appt.priority === "Normal"
                                      ? "bg-gray-100 text-gray-700 ring-gray-200"
                                      : appt.priority === "Urgent"
                                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                                        : "bg-red-50 text-red-700 ring-red-200",
                                  )}
                                >
                                  {appt.priority}
                                </span>
                              </div>
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

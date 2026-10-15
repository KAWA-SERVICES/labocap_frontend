"use client";

import {
  useState, useRef, useEffect, useContext, createContext,
  Children, isValidElement,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useUIStore } from "@/stores/ui.store";
import { usePermissions } from "@/hooks/usePermissions";
import { useModules } from "@/hooks/useModules";
import { BrandMark } from "@/components/ui/BrandMark";
import {
  NAV,
  type Gate,
  type NavActionKey,
  type NavEntry,
  type NavSubItem,
} from "@/components/layout/nav-config";
import { useSidebarBadges } from "@/components/layout/useSidebarBadges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BadgeProps {
  count: number;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: number;
}

interface CollapseItemProps {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: number;
  children: React.ReactNode;
}

interface SubItemProps {
  /** Lien de navigation. Omettre et fournir `onClick` pour un déclencheur (ex. modal). */
  href?: string;
  label: string;
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// État actif du menu — un seul langage pour les trois niveaux
// ---------------------------------------------------------------------------

/**
 * Les trois niveaux de navigation signalaient l'élément courant de trois façons
 * sans rapport entre elles :
 *
 *   entrée de premier niveau   pastille azur pleine + une ombre colorée écrite
 *                              à la main (`0 2px 8px -2px rgba(46,75,216,.55)`)
 *   sous-entrée                fond blanc à 7 %, angles arrondis à droite
 *                              seulement, aucune trace d'azur
 *   section dépliante          rien du tout, même lorsqu'elle contient la page
 *                              affichée
 *
 * D'où l'impression que le tableau de bord « s'allume » autrement que le reste
 * du menu. L'azur devient la seule couleur de l'état courant, et la hiérarchie
 * s'exprime par son intensité : aplat plein au premier niveau, voile teinté
 * doublé d'un filet vertical pour une sous-entrée, simple mise en blanc du
 * libellé pour la section qui la contient.
 */
const NAV_ACTIVE = "bg-blue-600 text-white";
const NAV_IDLE =
  "text-sidebar-link hover:bg-white/[0.06] hover:text-sidebar-link-hover";
/** Assiette commune : même gouttière, même rayon, même tempo qu'ailleurs. */
const NAV_BASE =
  "mx-2 flex items-center rounded-[var(--radius-control)] px-4 py-2.5 " +
  "text-[.9rem] transition-colors duration-[var(--duration-fast)] ease-emphasized";

function Badge({ count }: BadgeProps) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
      {count}
    </span>
  );
}

function NavItem({ href, icon, label, collapsed, badge = 0 }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`${NAV_BASE} ${collapsed ? "justify-center" : "gap-3"} ${
        isActive ? NAV_ACTIVE : NAV_IDLE
      }`}
      title={collapsed ? label : undefined}
    >
      <span className="flex-shrink-0 w-5 h-5">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          <Badge count={badge} />
        </>
      )}
    </Link>
  );
}

/**
 * Accordéon : un seul menu ouvert à la fois.
 *
 * L'état vivait dans chaque `CollapseItem`, initialisé une fois par
 * `useState(containsActive)`. Deux conséquences : ouvrir un menu puis naviguer
 * ailleurs laissait le premier ouvert, et une barre à treize sections finissait
 * dépliée de bout en bout. On remonte donc la décision d'un cran — un seul
 * libellé ouvert, connu de tous.
 */
const MenuOuvertContext = createContext<{
  ouvert: string | null;
  setOuvert: (label: string | null) => void;
}>({ ouvert: null, setOuvert: () => {} });

function CollapseItem({
  icon,
  label,
  collapsed,
  badge = 0,
  children,
}: CollapseItemProps) {
  const pathname = usePathname();

  // Les sous-entrées sont passées en `children` : on lit leur `href` pour savoir
  // si la page courante appartient à cette section. Sans cela, une section
  // repliée ne portait aucune marque alors qu'elle contenait l'écran affiché —
  // et se refermait à chaque navigation, faisant perdre le fil.
  const childHrefs = Children.toArray(children)
    .map((child) =>
      isValidElement<{ href?: string }>(child) ? child.props.href : undefined,
    )
    .filter((href): href is string => Boolean(href));
  const containsActive = childHrefs.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

  const { ouvert, setOuvert } = useContext(MenuOuvertContext);
  const open = ouvert === label;

  // La navigation désigne le menu ouvert : entrer dans une section l'ouvre et
  // referme les autres. Dépendance sur le seul `pathname` — sinon un menu
  // contenant la page courante se rouvrirait aussitôt qu'on le referme.
  useEffect(() => {
    if (containsActive) setOuvert(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Le rail replié ouvre son volet au survol : état local, sans rapport avec
  // l'accordéon, qui ne concerne que la barre déployée.
  const [survol, setSurvol] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);

  if (collapsed) {
    // En mode replié, on affiche un flyout au survol (positionné en `fixed` pour
    // échapper au `overflow-hidden` de la sidebar) listant les sous-éléments,
    // afin que les sections à enfants restent accessibles.
    return (
      <div
        ref={triggerRef}
        className="relative"
        onMouseEnter={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) setFlyoutTop(rect.top);
          setSurvol(true);
        }}
        onMouseLeave={() => setSurvol(false)}
      >
        <div
          className={`${NAV_BASE} cursor-pointer justify-center ${
            containsActive ? NAV_ACTIVE : NAV_IDLE
          }`}
          title={label}
        >
          <span className="flex-shrink-0 w-5 h-5">{icon}</span>
        </div>
        {survol && (
          // `pl-1` sert de pont de survol entre l'icône et le panneau.
          <div className="fixed left-16 z-50 pl-1" style={{ top: flyoutTop }}>
            <div className="min-w-[210px] rounded-[var(--radius-surface)] border border-white/10 bg-gray-900 py-2 shadow-[var(--elevation-overlay)]">
              <div className="px-4 pb-2 mb-1 border-b border-white/10 text-xs uppercase tracking-wider text-sidebar-link font-semibold">
                {label}
              </div>
              {children}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOuvert(open ? null : label)}
        className={`${NAV_BASE} w-[calc(100%-16px)] gap-3 text-left ${
          containsActive
            ? "font-medium text-white"
            : "text-sidebar-link hover:bg-white/[0.06] hover:text-sidebar-link-hover"
        }`}
      >
        <span className="flex-shrink-0 w-5 h-5">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        <Badge count={badge} />
        <span className="flex-shrink-0 ml-1">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
      </button>
      {open && (
        <div className="ml-6 border-l border-white/15 mt-0.5 mb-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function SubItem({ href, label, onClick }: SubItemProps) {
  const pathname = usePathname();
  const isActive = !!href && pathname === href;
  // `-ml-px` fait chevaucher le filet actif sur la ligne de guidage du groupe :
  // l'azur s'y substitue au lieu de s'y ajouter, sans décaler le libellé.
  const cls = `flex w-full items-center rounded-r-[var(--radius-control)] py-2 pl-4 pr-4 text-left text-[.9rem] transition-colors duration-[var(--duration-fast)] ease-emphasized ${
    isActive
      ? "-ml-px border-l-2 border-blue-500 bg-blue-600/[0.18] pl-[calc(1rem-1px)] font-medium text-white"
      : "text-sidebar-link hover:bg-white/[0.05] hover:text-sidebar-link-hover"
  }`;

  // Déclencheur (ex. modal global) : bouton au lieu d'un lien.
  if (!href) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

/**
 * Collecte récursivement les `href` d'un arbre d'éléments React.
 *
 * Les entrées d'un groupe sont hétérogènes : `NavItem` porte son `href`
 * directement, `CollapseItem` le porte dans SES enfants, et les deux sont
 * souvent enveloppés dans un `{can(...) && …}`. Une lecture au premier niveau
 * manquerait donc la majorité des liens.
 */
function collectHrefs(node: React.ReactNode): string[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const props = child.props as { href?: string; children?: React.ReactNode };
    return [
      ...(props.href ? [props.href] : []),
      ...(props.children ? collectHrefs(props.children) : []),
    ];
  });
}

/**
 * Rubrique du menu — libellé repliable coiffant ses entrées.
 *
 * Le libellé était auparavant un simple texte, frère des entrées qui le
 * suivaient : il ne pouvait donc rien masquer. Les entrées sont désormais ses
 * ENFANTS, ce qui lui permet de les replier comme `CollapseItem` replie les
 * siennes.
 *
 * L'état est persisté (cf. `ui.store`) : sur un menu de trente entrées, replier
 * les rubriques inutilisées n'a d'intérêt que si le réglage survit au
 * rechargement.
 *
 * Une rubrique repliée contenant la page affichée s'ouvre d'elle-même — même
 * règle que les sections dépliantes : on ne perd jamais de vue où l'on se
 * trouve.
 */
function NavGroup({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { collapsedGroups, toggleGroup } = useUIStore();

  const containsActive = collectHrefs(children).some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  const isCollapsed = collapsedGroups.includes(label) && !containsActive;

  // Menu replié en rail d'icônes : plus de place pour un libellé, et aucune
  // colonne où replier quoi que ce soit. On garde le simple séparateur.
  if (collapsed) {
    return (
      <>
        <div className="mx-2 my-2 border-t border-white/15" />
        {children}
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleGroup(label)}
        aria-expanded={!isCollapsed}
        className="mt-5 mb-2 flex w-full items-center gap-1.5 px-2 text-left transition-colors duration-[var(--duration-fast)] ease-emphasized hover:text-sidebar-link-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
        <ChevronDown
          className={`h-3 w-3 flex-shrink-0 text-gray-500 transition-transform duration-[var(--duration-fast)] ease-emphasized ${
            isCollapsed ? "-rotate-90" : ""
          }`}
        />
        <span className="text-[.6875rem] font-semibold uppercase tracking-[0.08em] text-gray-500">
          {label}
        </span>
      </button>
      {!isCollapsed && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  // Un seul menu ouvert à la fois — voir MenuOuvertContext.
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
  const { can, canAny, canAll } = usePermissions();
  const { has } = useModules();
  const { openTimeoffModal } = useUIStore();
  const pathname = usePathname();

  // À la navigation (clic sur un lien du menu), on referme le menu overlay mobile
  // — comme Laravel où le menu se masque après le choix d'une entrée sur petit écran.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  // Détection du petit écran (< 768px). Sur mobile, le menu est TOUJOURS déployé
  // (libellés visibles) : le mode réduit « condensed » est réservé au desktop,
  // exactement comme dans Laravel/Hyper.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sur mobile, jamais réduit : on affiche toujours les libellés (comme Laravel).
  const collapsed = isMobile ? false : sidebarCollapsed;

  // Compteurs des pastilles — cf. useSidebarBadges.
  const badges = useSidebarBadges();

  // Sous-entrées sans lien : la configuration les désigne par une clé.
  const actions: Record<NavActionKey, () => void> = { openTimeoffModal };

  /**
   * Une entrée s'affiche si son module est activé ET si l'utilisateur a la
   * permission demandée — `can` pour une permission seule, `canAny` / `canAll`
   * pour une liste selon `mode`. Sans `gate`, elle est visible de tous.
   */
  const isVisible = (gate?: Gate): boolean => {
    if (!gate) return true;
    if (gate.module && !has(gate.module)) return false;
    const { permission } = gate;
    if (permission === undefined) return true;
    if (!Array.isArray(permission)) return can(permission);
    return gate.mode === "all" ? canAll(...permission) : canAny(...permission);
  };

  const renderSubItem = (child: NavSubItem) =>
    child.kind === "link" ? (
      <SubItem key={child.href} href={child.href} label={child.label} />
    ) : (
      <SubItem key={child.label} label={child.label} onClick={actions[child.action]} />
    );

  const renderEntry = (item: NavEntry) =>
    item.kind === "link" ? (
      <NavItem
        key={item.href}
        href={item.href}
        icon={item.icon}
        label={item.label}
        collapsed={collapsed}
        badge={item.badge ? (badges[item.badge] ?? 0) : undefined}
      />
    ) : (
      <CollapseItem
        key={item.label}
        icon={item.icon}
        label={item.label}
        collapsed={collapsed}
        badge={item.badge ? (badges[item.badge] ?? 0) : undefined}
      >
        {item.children.map((child) => isVisible(child.gate) && renderSubItem(child))}
      </CollapseItem>
    );

  // Logo + nom du labo depuis les Paramètres, avec repli sur la route publique
  // `/public/branding` : `/setting-apps` exige la permission `view-settings`, si
  // bien qu'un technicien ne voyait jusqu'ici que l'initiale de repli.

  return (
    <>
      {/* Fond assombri sous 768px quand le menu overlay est ouvert (Hyper). */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "hyper-sidebar text-white flex flex-col overflow-hidden",
          "transition-[transform,width] duration-[var(--duration-slow)] ease-emphasized",
          // Mobile (< 768px) : menu hors écran par défaut, en overlay fixe une
          // fois ouvert — calque de `.leftside-menu { display:none }` +
          // `.sidebar-enable .leftside-menu` du thème Hyper.
          // z-40 : sous la topbar (z-50) pour que le hamburger reste visible,
          // au-dessus du fond assombri (z-30) — comme Hyper (navbar 1001 / menu 10).
          "fixed inset-y-0 left-0 z-40 w-64",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop (>= 768px) : dans le flux, largeur pilotée par le mode réduit.
          "md:static md:z-auto md:translate-x-0 md:flex-shrink-0",
          collapsed ? "md:w-16" : "md:w-64",
        ].join(" ")}
      >
      {/* ── Tête du menu : la marque du PRODUIT ─────────────────────────────
          On se connecte à AnapathLab, on travaille chez un laboratoire. La
          coque de l'application porte donc l'identité du produit ; celle du
          client apparaît là où elle l'engage — barre du haut et documents
          imprimés (comptes rendus, factures, feuilles de caisse).

          Auparavant le logo du laboratoire occupait cet emplacement, ce qui
          obligeait `AppLogo` à arbitrer entre trois identités par une chaîne de
          replis. L'arbitrage disparaît avec la séparation. */}
      <div className="flex h-[70px] flex-shrink-0 items-center justify-center border-b border-white/15">
        {collapsed ? (
          <BrandMark compact surface="dark" />
        ) : (
          <BrandMark surface="dark" className="text-lg" />
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto py-3 overflow-x-hidden">
        <MenuOuvertContext.Provider value={{ ouvert: menuOuvert, setOuvert: setMenuOuvert }}>

        {/* Menu décrit dans nav-config.tsx : rubriques → entrées → sous-entrées. */}
        {NAV.map(
          (section, index) =>
            isVisible(section.gate) && (
              <NavGroup key={section.label} label={section.label} collapsed={collapsed}>
                {section.items.map((item) => isVisible(item.gate) && renderEntry(item))}

                {/* Bottom padding */}
                {index === NAV.length - 1 && <div className="h-4" />}
              </NavGroup>
            ),
        )}
      </MenuOuvertContext.Provider>
      </nav>
    </aside>
    </>
  );
}

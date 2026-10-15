"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { User, LogOut, ChevronDown } from "lucide-react";

/** Icône hamburger identique à Laravel (`mdi mdi-menu`) — barres serrées. */
function MdiMenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
    </svg>
  );
}
import { useUIStore } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";
import { useBranchStore } from "@/stores/branch.store";
import { useBranding } from "@/hooks/useBranding";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/Button";
import { nomComplet } from "@/lib/utils";

export function Topbar() {
  const { toggleSidebar, toggleMobileSidebar } = useUIStore();

  // Calque du `.button-menu-mobile` Hyper : sous 768px, on ouvre/ferme le menu
  // en overlay ; au-dessus, on bascule le mode réduit (condensed) du menu.
  const handleMenuToggle = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };
  const { user, clearAuth } = useAuthStore();
  const clearBranch = useBranchStore((state) => state.clearBranch);
  const branch = useBranchStore((state) => state.branch);
  const { appName } = useBranding();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user
    ? `${user.lastname.charAt(0)}${user.firstname.charAt(0)}`.toUpperCase()
    : "?";
  const fullName = user ? nomComplet(user.lastname, user.firstname) : "";
  const roleName = user?.roles?.[0]?.name ?? "";

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout errors
    } finally {
      clearAuth();
      clearBranch();
      // Vide le cache React Query (données du compte qui part) puis recharge
      // la page entière : un `router.push` garderait en mémoire stores, cache
      // et composants jusqu'à la connexion suivante.
      queryClient.clear();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- le rechargement complet est voulu
      window.location.assign("/login");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // `relative` est indispensable : sans classe de positionnement, `z-index` est
  // ignoré (position: static), et le menu profil passait alors sous le PageHeader
  // collant du contenu (z-20). `shrink-0` empêche la barre d'être compressée.
  return (
    <header className="hyper-topbar relative z-50 flex h-[70px] shrink-0 items-center justify-between gap-3 px-3 sm:px-4">
      {/* Left: hamburger */}
      <button
        onClick={handleMenuToggle}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        aria-label="Afficher/masquer le menu"
      >
        <MdiMenuIcon className="h-6 w-6" />
      </button>

      {/* ── Contexte : chez qui et où ────────────────────────────────────────
          L'identité du laboratoire s'affiche ici, et non plus dans la tête du
          menu — celle-ci porte la marque du produit. C'est le bon endroit :
          la barre du haut dit où l'on se trouve, et le nom de l'agence y était
          déjà attendu à côté du sélecteur de branche.

          Masqué sous `sm` : sur mobile la place revient au menu et au profil. */}
      <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
        {appName ? (
          <span className="truncate text-[.9375rem] font-semibold text-gray-900">
            {appName}
          </span>
        ) : null}
        {branch?.name ? (
          <>
            <span aria-hidden="true" className="text-gray-300">
              ·
            </span>
            <span className="truncate text-[.875rem] text-gray-500">
              {branch.name}
            </span>
          </>
        ) : null}
      </div>

      {/* Right: user dropdown */}
      <div className="relative flex-shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2.5 rounded-[var(--radius-control)] p-1.5 pr-2 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[.8125rem] font-semibold text-white shadow-sm ring-1 ring-inset ring-white/20">
            {initials}
          </div>
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-[.9rem] font-semibold text-gray-800">
              {fullName || user?.firstname}
            </p>
            {roleName && <p className="text-xs text-gray-500">{roleName}</p>}
          </div>
          <ChevronDown
            className={`hidden h-4 w-4 text-gray-400 transition-transform sm:block ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-[var(--radius-surface)] bg-white shadow-[var(--elevation-overlay)]">
            {/* En-tête utilisateur */}
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-white/20">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {fullName || "Utilisateur"}
                </p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            {/* Actions */}
            <div className="p-1.5">
              <Link
                href="/profile"
                className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-[.9rem] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                onClick={() => setIsOpen(false)}
              >
                <User className="h-4 w-4 text-gray-400" />
                Mon compte
              </Link>
              <Button
                onClick={handleLogout}
                icon={<LogOut className="h-4 w-4" />}
                className="w-full justify-start gap-2.5 rounded-[var(--radius-control)] bg-transparent px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 hover:shadow-none"
              >
                Se déconnecter
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

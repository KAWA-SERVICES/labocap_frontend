"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Peut être asynchrone : le bouton se verrouille alors jusqu'à résolution. */
  onConfirm: () => unknown;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  isLoading?: boolean;
  /** Une seconde réponse possible, entre « Annuler » et la confirmation. */
  secondaryLabel?: string;
  onSecondary?: () => unknown;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmVariant = "danger",
  isLoading = false,
  secondaryLabel,
  onSecondary,
}: ConfirmModalProps) {
  // Bloquer le scroll
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isOpen]);

  // Fermer avec Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const confirmButtonClass =
    confirmVariant === "danger"
      ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
      : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-surface)] bg-white shadow-[var(--elevation-overlay)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ring-8",
                confirmVariant === "danger"
                  ? "bg-red-100 ring-red-50"
                  : "bg-blue-100 ring-blue-50"
              )}
            >
              <AlertTriangle
                className={cn(
                  "h-5 w-5",
                  confirmVariant === "danger" ? "text-red-600" : "text-blue-600"
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="confirm-modal-title"
                className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-gray-900"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{message}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-[var(--radius-control)] border border-gray-300 bg-white px-[.9rem] py-2 text-[.9rem] font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              disabled={isLoading}
              className="rounded-[var(--radius-control)] border border-blue-600 bg-white px-[.9rem] py-2 text-[.9rem] font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
            >
              {secondaryLabel}
            </button>
          )}
          {/* Bouton partagé : spinner pendant `isLoading` et, si `onConfirm` est
              asynchrone, verrou automatique contre un second clic. */}
          <Button
            onClick={onConfirm}
            loading={isLoading}
            className={cn(
              "gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2",
              confirmButtonClass
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useId, useRef } from "react";
import {
  Toaster as FluentToaster,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody,
} from "@fluentui/react-components";
import { useToastStore, type ToastItem } from "@/store/toastStore";

const VARIANT_INTENT: Record<NonNullable<ToastItem["variant"]>, "success" | "error" | "info"> = {
  default: "info",
  destructive: "error",
  success: "success",
};

/** `src/store/toastStore.ts`'s `toast()` free function stays the single
 * call-site API used across the app (~10 files) — this component just
 * mirrors its `toasts` array into Fluent's own imperative toast controller,
 * so the store (with its own 4500ms auto-dismiss timer) remains the single
 * source of truth for *when* a toast disappears rather than juggling two
 * independent timers. */
export function Toaster() {
  const toasterId = useId();
  const { dispatchToast, dismissToast } = useToastController(toasterId);
  const toasts = useToastStore((s) => s.toasts);
  const dispatchedIds = useRef(new Set<string>());

  useEffect(() => {
    const currentIds = new Set(toasts.map((t) => t.id));

    for (const id of dispatchedIds.current) {
      if (!currentIds.has(id)) {
        dismissToast(id);
        dispatchedIds.current.delete(id);
      }
    }

    for (const t of toasts) {
      if (dispatchedIds.current.has(t.id)) continue;
      dispatchedIds.current.add(t.id);
      dispatchToast(
        <Toast>
          <ToastTitle>{t.title}</ToastTitle>
          {t.description && <ToastBody>{t.description}</ToastBody>}
        </Toast>,
        { intent: VARIANT_INTENT[t.variant ?? "default"], toastId: t.id, timeout: -1 }
      );
    }
  }, [toasts, dispatchToast, dismissToast]);

  return <FluentToaster toasterId={toasterId} position="bottom-end" />;
}

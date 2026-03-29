"use client";

/**
 * DaisyUI loading spinner for hub async UI (health pings, KPIs, module panels, logs).
 * Location: hub/src/components/loading-spinner.tsx (generated).
 */
export function LoadingSpinner(props: { className?: string; size?: "xs" | "sm" | "md" }) {
  const size = props.size ?? "sm";
  const sizeCls = size === "xs" ? "loading-xs" : size === "md" ? "loading-md" : "loading-sm";
  return (
    <span
      className={`loading loading-spinner text-fuchsia-400 ${sizeCls} ${props.className ?? ""}`}
      aria-label="Loading"
      role="status"
    />
  );
}

import React, { useEffect, useRef } from "react";
import AbitatLogoLoader from "@/components/general_component/AbitatLogoLoader";

export default function BlockingPageLoader({ visible = false, label = "Cargando..." }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    overlayRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      aria-label={label}
      tabIndex={-1}
    >
      <AbitatLogoLoader className="scale-90" />
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

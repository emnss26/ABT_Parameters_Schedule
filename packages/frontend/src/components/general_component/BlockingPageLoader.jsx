import React from "react";
import AbitatLogoLoader from "@/components/general_component/AbitatLogoLoader";

export default function BlockingPageLoader({ visible = false, label = "Cargando..." }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm">
      <AbitatLogoLoader className="scale-90" />
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

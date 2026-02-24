import React from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/general_component/AppLayout";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <AppLayout noPadding>
      <div className="flex min-h-screen flex-col items-center justify-center bg-white">
        <img
          src="/Abitat_img.png"
          alt="Abitat Construction Solutions"
          className="mb-6 w-auto max-h-[160px] object-contain md:max-h-[180px]"
          style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.10))" }}
        />

        <div className="mt-4 flex flex-col items-center space-y-5">
          <h1 className="text-center text-2xl tracking-tight text-neutral-700">
            Internal BIM Management Platform
          </h1>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 px-6 py-2.5 text-sm font-medium text-[rgba(32,31,31,1)] shadow-sm transition-colors duration-500 ease-out hover:bg-[rgb(170,32,47)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(170,32,47)] focus-visible:ring-offset-2 active:scale-[0.99]"
            aria-label="Go to Login"
          >
            Go to Login
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

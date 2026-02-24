import React from "react";
import AppLayout from "@/components/general_component/AppLayout";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;
const clientId = import.meta.env.VITE_CLIENT_ID;

export default function LoginPage() {
  const handleLogin = () => {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: `${backendUrl}/auth/three-legged`,
      scope: "account:read data:read data:create data:write",
    });

    window.location.href = `https://developer.api.autodesk.com/authentication/v2/authorize?${params.toString()}`;
  };

  return (
    <AppLayout noPadding>
      <div className="grid h-full grid-cols-1 bg-white md:grid-cols-2">
        <div className="flex items-center justify-center p-6">
          <img
            src="/Abitat_img.png"
            alt="Abitat Construction Solutions"
            className="w-auto max-h-[220px] object-contain md:max-h-[280px]"
            style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.10))" }}
          />
        </div>

        <div className="flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-700 md:text-4xl">
              Login
            </h1>

            <p className="text-neutral-600">
              Please authenticate to access the platform using your Autodesk account.
            </p>

            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 px-6 py-2.5 text-sm font-medium text-[rgb(170,32,47)] shadow-sm transition-colors duration-500 ease-out hover:bg-[rgb(170,32,47)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(170,32,47)] focus-visible:ring-offset-2 active:scale-[0.99]"
            >
              Authenticate with Autodesk
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

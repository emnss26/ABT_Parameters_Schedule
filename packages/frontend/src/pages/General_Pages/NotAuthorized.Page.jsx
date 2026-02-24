import React from "react";
import { useNavigate } from "react-router-dom";

export default function NotAuthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-red-50 p-4 text-center">
      <h1 className="mb-4 text-5xl font-bold text-red-600">Acceso Denegado</h1>
      <p className="mb-8 text-lg text-gray-700">
        Tu sesión ha expirado o no tienes permisos para ver este recurso.
      </p>
      <button
        type="button"
        onClick={() => navigate("/login")}
        className="rounded bg-red-600 px-6 py-2 text-white transition hover:bg-red-700"
      >
        Ir a Login
      </button>
    </div>
  );
}

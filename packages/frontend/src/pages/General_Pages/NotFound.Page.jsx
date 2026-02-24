import React from "react";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-100 p-4 text-center">
      <h1 className="mb-4 text-6xl font-bold text-gray-800">404</h1>
      <p className="mb-8 text-xl text-gray-600">
        Ups, no pudimos encontrar la página que buscas.
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="rounded bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700"
      >
        Volver al Inicio
      </button>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import { FolderOpen } from "lucide-react";

import AppLayout from "@/components/general_component/AppLayout";
import AbitatLogoLoader from "@/components/general_component/AbitatLogoLoader";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;

export default function AECProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useCookies(["access_token"]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAccProjects = async () => {
      try {
        setLoading(true);

        const response = await fetch(`${backendUrl}/aec/graphql-projects`, {
          credentials: "include",
        });

        if (response.status === 401 || response.status === 403) {
          navigate("/login");
          return;
        }

        const result = await response.json();

        if (!result.success && result.error) {
          throw new Error(result.error);
        }
        //console.log('Project Data', result)
        setProjects(result.data?.aecProjects || []);
        setError("");
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar los proyectos. Revisa tu conexión.");
      } finally {
        setLoading(false);
      }
    };

    fetchAccProjects();
  }, [navigate]);

  return (
    <AppLayout>
      <div className="grid min-h-[80vh] grid-cols-1 items-center gap-8 p-6 lg:grid-cols-2">
        <div className="flex items-center justify-center animate-in fade-in duration-700 slide-in-from-left-10">
          <img
            src="/Abitat_img.png"
            alt="Abitat Construction Solutions"
            className="max-h-[220px] w-auto object-contain drop-shadow-xl transition-transform duration-500 hover:scale-105"
          />
        </div>

        <div className="flex w-full flex-col items-center justify-center">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-gray-800">
            Lista de Proyectos
          </h2>

          <div className="relative flex min-h-[400px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-1 shadow-xl">
            {loading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm animate-in fade-in duration-300">
                <AbitatLogoLoader className="scale-75" />
                <p className="mt-4 animate-pulse text-sm font-medium text-gray-500">
                  Cargando...
                </p>
              </div>
            ) : null}

            {error && !loading ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <div className="mb-2 text-lg text-red-500">⚠️</div>
                <p className="font-medium text-red-600">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 text-sm text-gray-500 underline hover:text-gray-800"
                >
                  Reintentar
                </button>
              </div>
            ) : null}

            {!loading && !error ? (
              <div
                className="custom-scrollbar flex-1 overflow-y-auto p-4"
                style={{ maxHeight: "60vh" }}
              >
                {projects.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {projects.map((p) => (
                      <li
                        key={p.id}
                        className="group flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-all duration-300 hover:border-[rgb(170,32,47)]/30 hover:shadow-md"
                      >
                        <div className="pr-4">
                          <h3 className="text-sm font-bold text-gray-800 transition-colors group-hover:text-[rgb(170,32,47)]">
                            {p.name}
                          </h3>
                        </div>

                        <button
                          className="whitespace-nowrap rounded-lg bg-[rgb(170,32,47)] px-4 py-2 text-xs font-semibold text-white opacity-0 shadow-sm transition-all duration-300 hover:bg-[rgb(150,28,42)] hover:shadow-md active:scale-95 group-hover:translate-x-0 group-hover:opacity-100 translate-x-2"
                          onClick={() => {
                            sessionStorage.setItem(
                              "altProjectId",
                              p.alternativeIdentifiers?.dataManagementAPIProjectId
                            );
                            sessionStorage.setItem("projectName", p.name);
                            navigate(`/parameter-checker/${p.id}`);
                          }}
                        >
                          Abrir Proyecto →
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-10 text-gray-400">
                    <FolderOpen className="mb-2 h-10 w-10 opacity-20" />
                    <p>No se encontraron proyectos disponibles.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

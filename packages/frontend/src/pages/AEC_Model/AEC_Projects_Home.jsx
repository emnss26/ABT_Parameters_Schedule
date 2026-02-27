import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const requestDedupRef = useRef(new Map());

  const shouldSkipDevDuplicateFetch = useCallback((key, windowMs = 1500) => {
    if (!import.meta.env.DEV) return false;
    const now = Date.now();
    const last = requestDedupRef.current.get(key) || 0;
    requestDedupRef.current.set(key, now);
    return now - last < windowMs;
  }, []);

  useEffect(() => {
    const fetchAccProjects = async () => {
      if (shouldSkipDevDuplicateFetch("graphql-projects")) return;

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

        setProjects(result.data?.aecProjects || []);
        setError("");
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar los proyectos. Revisa tu conexion.");
      } finally {
        setLoading(false);
      }
    };

    fetchAccProjects();
  }, [navigate, shouldSkipDevDuplicateFetch]);

  const openProject = (project, target) => {
    sessionStorage.setItem(
      "altProjectId",
      project.alternativeIdentifiers?.dataManagementAPIProjectId
    );
    sessionStorage.setItem("projectName", project.name);
    navigate(`/${target}/${project.id}`);
  };

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
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-gray-800">Lista de Proyectos</h2>

          <div className="relative flex min-h-[400px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-1 shadow-xl">
            {loading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm animate-in fade-in duration-300">
                <AbitatLogoLoader className="scale-75" />
                <p className="mt-4 animate-pulse text-sm font-medium text-gray-500">Cargando...</p>
              </div>
            ) : null}

            {error && !loading ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <div className="mb-2 text-lg text-red-500">Aviso</div>
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
              <div className="custom-scrollbar flex-1 overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
                {projects.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {projects.map((project) => (
                      <li
                        key={project.id}
                        className="group flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-all duration-300 hover:border-[rgb(170,32,47)]/30 hover:shadow-md"
                      >
                        <div className="pr-4">
                          <h3 className="text-sm font-bold text-gray-800 transition-colors group-hover:text-[rgb(170,32,47)]">
                            {project.name}
                          </h3>
                        </div>

                        <div className="flex translate-x-2 gap-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                          <button
                            className="whitespace-nowrap rounded-lg bg-[rgb(170,32,47)] px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-300 hover:bg-[rgb(150,28,42)] hover:shadow-md active:scale-95"
                            onClick={() => openProject(project, "parameter-checker")}
                          >
                            Parameter Checker
                          </button>
                          <button
                            className="whitespace-nowrap rounded-lg border border-[rgb(170,32,47)] px-3 py-2 text-[11px] font-semibold text-[rgb(170,32,47)] shadow-sm transition-all duration-300 hover:bg-[rgb(170,32,47)] hover:text-white hover:shadow-md active:scale-95"
                            onClick={() => openProject(project, "wbs-planner")}
                          >
                            WBS Planner
                          </button>
                        </div>
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

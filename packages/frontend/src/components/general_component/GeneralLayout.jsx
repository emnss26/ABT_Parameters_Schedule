import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import { User } from "lucide-react";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;

export default function GeneralLayout({ children, noPadding = false }) {
  const navigate = useNavigate();
  const [cookies, , removeCookie] = useCookies(["access_token"]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch(`${backendUrl}/auth/userprofile`, { credentials: "include" });
        if (!res.ok) throw new Error("No auth");
        const json = await res.json();
        setUserEmail(json?.data?.email || "");
      } catch {
        setUserEmail("");
      }
    };

    loadUser();
  }, [cookies.access_token]);

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    removeCookie("access_token", { path: "/" });
    navigate("/login");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <header className="flex items-center justify-between bg-[rgb(75,80,86)] px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium opacity-90 transition hover:opacity-100 sm:text-base"
          title="Ir al inicio"
        >
          Abitat Construction Solutions
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full p-1.5 transition hover:bg-white/10"
            title={userEmail || "Usuario"}
          >
            <User className="h-6 w-6" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 z-50 mt-2 w-56 rounded-md bg-white p-2 text-sm text-neutral-700 shadow-lg ring-1 ring-black/5"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="border-b px-2 py-1.5 text-xs text-neutral-500">
                {userEmail || "Not signed in"}
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/aec/projects");
                }}
                className="w-full rounded px-2 py-2 text-left hover:bg-neutral-100"
              >
                Go to Projects
              </button>

              {!!userEmail && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded px-2 py-2 text-left text-red-600 hover:bg-neutral-100"
                >
                  Logout
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={`flex-1 overflow-auto ${noPadding ? "" : "p-4"}`}>{children}</main>

      <footer className="flex justify-end bg-[rgb(170,32,47)] p-2 text-white">
        <span>Abitat Construction Solutions</span>
      </footer>
    </div>
  );
}

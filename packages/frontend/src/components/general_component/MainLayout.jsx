import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import { User } from "lucide-react";
import MainSideBar from "@/components/general_component/MainSideBar";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const [cookies, , removeCookie] = useCookies(["access_token"]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const res = await fetch(`${backendUrl}/auth/me`, { credentials: "include" });
        if (!res.ok) return;

        const json = await res.json();
        const nextEmail = json?.email || json?.user?.email || "";

        if (!cancelled) setEmail(nextEmail);
      } catch {
        // ignore
      }
    };

    if (cookies.access_token) loadUser();

    return () => {
      cancelled = true;
    };
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
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between gap-3 bg-[rgb(75,80,86)] px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium opacity-90 transition hover:opacity-100 sm:text-base"
          title="Ir al inicio"
        >
          Abitat Construction Solutions
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/aec-projects")}
            className="hidden items-center rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-[rgb(170,32,47)] shadow-sm transition-colors duration-500 hover:bg-[rgb(170,32,47)] hover:text-white sm:inline-flex"
          >
            Go Projects
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-[rgb(170,32,47)] shadow-sm transition-colors duration-500 hover:bg-[rgb(170,32,47)] hover:text-white"
          >
            Logout
          </button>

          <div className="ml-1 flex items-center gap-1 text-xs opacity-80">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{email || "Guest"}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <MainSideBar />
        <main className="flex-1 bg-white p-4">{children}</main>
      </div>

      <footer className="flex justify-end bg-[rgb(170,32,47)] p-2 text-white">
        <span>Abitat Construction Solutions</span>
      </footer>
    </div>
  );
}

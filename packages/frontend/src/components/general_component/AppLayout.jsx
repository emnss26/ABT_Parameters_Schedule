import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import {
  Blocks,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  ListTree,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const backendUrl = import.meta.env.VITE_API_BACKEND_BASE_URL;

const NAVIGATION = [
  { id: "home", label: "Inicio", icon: Home, href: "/" },
  { id: "projects", label: "Proyectos", icon: FolderKanban, href: "/aec-projects" },
];

export default function AppLayout({ children, noPadding = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [cookies, , removeCookie] = useCookies(["access_token"]);

  const [userEmail, setUserEmail] = useState("");
  const [collapsed, setCollapsed] = useState(true);
  const requestDedupRef = useRef(new Map());

  const projectRouteMatch = location.pathname.match(/^\/(parameter-checker|wbs-planner)\/([^/]+)/);
  const activeProjectId = projectRouteMatch?.[2] || null;
  const showSidebar = Boolean(activeProjectId);

  const navigationItems = useMemo(() => {
    if (!activeProjectId) return NAVIGATION;
    return [
      ...NAVIGATION,
      {
        id: "parameter-checker",
        label: "Revision de parametros",
        icon: Blocks,
        href: `/parameter-checker/${activeProjectId}`,
      },
      {
        id: "wbs-planner",
        label: "Planeador WBS",
        icon: ListTree,
        href: `/wbs-planner/${activeProjectId}`,
      },
    ];
  }, [activeProjectId]);

  const shouldSkipDevDuplicateFetch = useCallback((key, windowMs = 1500) => {
    if (!import.meta.env.DEV) return false;
    const now = Date.now();
    const last = requestDedupRef.current.get(key) || 0;
    requestDedupRef.current.set(key, now);
    return now - last < windowMs;
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (shouldSkipDevDuplicateFetch(`auth-userprofile:${cookies.access_token || "anon"}`)) return;

      try {
        const res = await fetch(`${backendUrl}/auth/userprofile`, { credentials: "include" });
        if (!res.ok) throw new Error("No auth");
        const json = await res.json();
        setUserEmail(json?.data?.email || "");
      } catch {
        setUserEmail("");
      }
    };

    loadProfile();
  }, [cookies.access_token, shouldSkipDevDuplicateFetch]);

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    removeCookie("access_token", { path: "/" });
    navigate("/login");
  };

  const isActiveNavItem = (item) => {
    if (item.id === "projects") {
      return (
        location.pathname === "/aec-projects" ||
        location.pathname.startsWith("/parameter-checker/") ||
        location.pathname.startsWith("/wbs-planner/")
      );
    }
    if (item.id === "parameter-checker") return location.pathname.startsWith("/parameter-checker/");
    if (item.id === "wbs-planner") return location.pathname.startsWith("/wbs-planner/");
    return item.href === location.pathname;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans">
      {showSidebar && (
        <aside
          className={cn(
            "z-20 flex flex-col border-r border-slate-800 bg-slate-900 text-slate-50 transition-all duration-300 ease-in-out",
            collapsed ? "w-16" : "w-64"
          )}
        >
          <div
            className="flex h-16 cursor-pointer items-center border-b border-slate-800/50 px-4 transition-colors hover:bg-slate-800/50"
            onClick={() => navigate("/")}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[rgb(170,32,47)] shadow-lg shadow-red-900/20">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              {!collapsed && (
                <div className="flex min-w-0 flex-col transition-opacity duration-300">
                  <span className="truncate text-sm font-bold tracking-tight">Abitat Construction</span>
                  <span className="truncate text-[10px] uppercase tracking-wider text-slate-400">Solutions</span>
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-6">
            <TooltipProvider delayDuration={0}>
              {navigationItems.map((item) => {
                const active = isActiveNavItem(item);

                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigate(item.href)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                          active
                            ? "bg-slate-800 text-white shadow-sm"
                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                          collapsed && "justify-center px-0"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 flex-shrink-0 transition-colors",
                            active ? "text-[rgb(170,32,47)]" : "text-slate-500 group-hover:text-slate-300"
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right" className="border-slate-700 bg-slate-900 font-medium text-white">
                        {item.label}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </nav>

          <div className="border-t border-slate-800/50 p-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white",
                collapsed && "justify-center px-0"
              )}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!collapsed && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider">Colapsar menu</span>}
            </Button>
          </div>
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col bg-slate-50/50">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
          <div className="flex items-center gap-2">
            {!showSidebar && (
              <div
                className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
                onClick={() => navigate("/")}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(170,32,47)]">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <span className="hidden font-bold text-slate-800 sm:inline">Abitat Construction Solutions</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full p-0 ring-2 ring-white transition-all hover:ring-slate-100 focus-visible:ring-0"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-[rgb(170,32,47)] font-medium text-white">
                      {userEmail ? userEmail.charAt(0).toUpperCase() : "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Usuario</p>
                    <p className="truncate text-xs leading-none text-muted-foreground">{userEmail}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Cerrar sesion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className={cn("flex-1 overflow-auto", noPadding ? "" : "")}>{children}</main>
      </div>
    </div>
  );
}

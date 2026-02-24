import { useState } from "react";
import { Link } from "react-router-dom";
import { Home, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { title: "Home", url: "/", icon: Home },
  { title: "Sheets Module", url: "/aec-model", icon: FileSpreadsheet },
];

export default function MainSideBar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-gray-200 bg-gray-100 transition-all",
        collapsed ? "w-16" : "w-44"
      )}
    >
      <div className="border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <span className={cn("font-semibold text-gray-800", collapsed && "hidden")}>
            Modules
          </span>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded text-gray-700 transition-colors duration-200 hover:bg-red-500 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {ITEMS.map(({ title, url, icon: Icon }) => (
            <li key={title}>
              <Link
                to={url}
                className="flex items-center gap-3 rounded p-2 text-gray-700 transition-colors duration-200 hover:bg-red-500 hover:text-white"
              >
                <Icon className="h-5 w-5" />
                {!collapsed && <span className="font-medium">{title}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

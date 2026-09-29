import React, { useState, useEffect } from "react";
import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, ClipboardList, LogOut, CircleDot, Receipt,
  RotateCcw, DollarSign, Clock, BarChart3, Shield, Settings, Menu, X, Users, UserPlus,
  AlertTriangle, Pill, UsersRound, RefreshCw, Search, ChevronDown,
  ArrowDownToLine, ArrowLeftRight, ClipboardCheck, UserCog, Truck, Plus,
  Gauge, TrendingUp,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { usePharmacyName } from "../hooks/usePharmacyName";
import { DropdownMenu } from "./ui";
import NotificationBell from "./NotificationBell";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  roles: string[];
  permissions?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles: string[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["staff", "branch_manager", "admin"] },
      { to: "/overview", label: "Business Overview", icon: Gauge, roles: ["staff", "branch_manager", "admin"], permissions: ["view_reports"] },
    ],
  },
  {
    title: "Inventory",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/medicines", label: "Medicines", icon: Pill, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_medicines"] },
      { to: "/inventory-alerts", label: "Inventory Alerts", icon: AlertTriangle, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_inventory"] },
    ],
  },
  {
    title: "Stock",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/stock-transfer", label: "Stock Transfer", icon: ArrowLeftRight, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_inventory"] },
      { to: "/stock-adjustment", label: "Stock Adjustment", icon: ArrowDownToLine, roles: ["staff", "branch_manager", "admin"], permissions: ["perform_stock_adjustment"] },
    ],
  },
  {
    title: "Sales",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["staff", "branch_manager", "admin"] },
      { to: "/sales", label: "Sales", icon: Receipt, roles: ["staff", "branch_manager", "admin"], permissions: ["view_reports"] },
      { to: "/refunds", label: "Sales Return", icon: RotateCcw, roles: ["staff", "branch_manager", "admin"], permissions: ["process_refunds"] },
    ],
  },
  {
    title: "Purchases",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/purchases", label: "Purchases", icon: Truck, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_inventory"] },
      { to: "/purchase-orders", label: "Purchase Orders", icon: ClipboardCheck, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_inventory"] },
    ],
  },
  {
    title: "Finance",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/expenses", label: "Expenses", icon: DollarSign, roles: ["staff", "branch_manager", "admin"], permissions: ["manage_expenses"] },
      { to: "/daily-session", label: "Daily Session", icon: Clock, roles: ["staff", "branch_manager", "admin"] },
    ],
  },
  {
    title: "People",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/customers", label: "Customers", icon: UsersRound, roles: ["staff", "branch_manager", "admin"] },
      { to: "/staff-performance", label: "Staff Performance", icon: TrendingUp, roles: ["staff", "branch_manager", "admin"], permissions: ["view_reports"] },
    ],
  },
  {
    title: "Reports",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3, roles: ["staff", "branch_manager", "admin"], permissions: ["view_reports"] },
    ],
  },
  {
    title: "Activity",
    roles: ["staff", "branch_manager", "admin"],
    items: [
      { to: "/activity", label: "Activity", icon: ClipboardList, roles: ["staff", "branch_manager", "admin"] },
      { to: "/audit", label: "Audit Logs", icon: Shield, roles: ["staff", "branch_manager", "admin"], permissions: ["view_audit_logs"] },
    ],
  },
  {
    title: "User Management",
    roles: ["admin"],
    items: [
      { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
    ],
  },
  {
    title: "Settings",
    roles: ["admin"],
    items: [
      { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

const CREATE_ITEMS: { group: string; label: string; to: string; icon: React.ElementType; permission: string }[] = [
  { group: "Sales", label: "New Sale", to: "/pos", icon: ShoppingCart, permission: "process_sales" },
  { group: "Sales", label: "New Customer", to: "/customers", icon: UserPlus, permission: "process_sales" },
  { group: "Inventory", label: "New Medicine", to: "/medicines", icon: Pill, permission: "manage_medicines" },
  { group: "Inventory", label: "New Purchase Order", to: "/purchase-orders", icon: ClipboardCheck, permission: "manage_inventory" },
  { group: "Inventory", label: "New Stock Transfer", to: "/stock-transfer", icon: ArrowLeftRight, permission: "manage_inventory" },
  { group: "Inventory", label: "New Stock Adjustment", to: "/stock-adjustment", icon: ArrowDownToLine, permission: "manage_inventory" },
  { group: "Finance", label: "New Expense", to: "/expenses/new", icon: DollarSign, permission: "manage_expenses" },
  { group: "People", label: "New User", to: "/users", icon: Users, permission: "manage_users" },
];

const CREATE_GROUPS = ["Sales", "Inventory", "Finance", "People"];

function UserAvatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const sizeClasses = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClasses} rounded-full object-cover ring-2 ring-line`}
      />
    );
  }

  return (
    <div className={`${sizeClasses} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium ring-2 ring-line`}>
      {initials}
    </div>
  );
}

function SidebarSection({ section, userRole, userPermissions, collapsed }: { section: NavSection; userRole: string; userPermissions: string[]; collapsed: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const items = section.items.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (item.permissions && !item.permissions.some((p) => userPermissions.includes(p))) return false;
    return true;
  });

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <div className="mb-1 pb-1 border-b border-line last:border-0">
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center justify-center p-2 rounded-control transition mx-1 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-[0_6px_16px_rgba(28,100,242,0.35)]"
                    : "text-gray hover:text-navy hover:bg-paper"
                }`
              }
            >
              {({ isActive }) => (
                <item.icon size={18} strokeWidth={1.8} className={isActive ? "text-white" : "text-gray opacity-80"} />
              )}
            </NavLink>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-soft hover:text-navy transition"
      >
        {section.title}
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {expanded && (
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 rounded-control text-sm transition mx-2 ${
                  isActive
                    ? "bg-blue-600 text-white font-medium shadow-[0_6px_16px_rgba(28,100,242,0.35)]"
                    : "text-gray hover:text-navy hover:bg-paper"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} strokeWidth={1.8} className={isActive ? "text-white" : "text-gray opacity-80"} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [topSearch, setTopSearch] = useState("");
  const userRole = user?.role ?? "";
  const canManageMedicines = hasPermission("manage_medicines");
  const userPermissions = user?.permissions ?? [];
  const pharmacyName = usePharmacyName();
  const createItems = CREATE_ITEMS.filter((item) => hasPermission(item.permission));

  useEffect(() => {
    document.title = `${pharmacyName} - Owner Console`;
  }, [pharmacyName]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  function handleTopSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = topSearch.trim();
    if (!q) return;
    if (/^(INV|RET|HOLD|CRD)-/i.test(q)) {
      navigate(`/sales?search=${encodeURIComponent(q)}`);
    } else {
      navigate(`/medicines?search=${encodeURIComponent(q)}`);
    }
  }

  const handleRefresh = () => {
    window.location.reload();
  };

  const totalNavItems = NAV_SECTIONS.reduce(
    (acc, section) => acc + section.items.filter((i) => {
      if (!i.roles.includes(userRole)) return false;
      if (i.permissions && !i.permissions.some((p) => userPermissions.includes(p))) return false;
      return true;
    }).length,
    0
  );

  return (
    <div className="h-screen bg-content-bg flex overflow-hidden">
      {/* Sidebar: expanded full labels, or collapsed icon rail on desktop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`relative z-50 shrink-0 bg-white border-r border-line flex-col h-full overflow-hidden transition-all duration-200 ease-out
          ${sidebarOpen ? "w-[210px] flex" : "hidden md:flex md:w-[60px]"}`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className={`px-4 py-5 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0" title={sidebarOpen ? undefined : pharmacyName}>
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Pill size={14} className="text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-sans font-bold text-[13.5px] tracking-wide text-navy uppercase truncate">{pharmacyName}</span>
            )}
          </Link>
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 text-gray-soft hover:text-navy transition rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Close sidebar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Grouped Nav List */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <SidebarSection
              key={section.title}
              section={section}
              userRole={userRole}
              userPermissions={userPermissions}
              collapsed={!sidebarOpen}
            />
          ))}
        </nav>

        {/* Bottom Cards (expanded only) */}
        {sidebarOpen && (
          <div className="px-3 pb-3 space-y-2">
            {/* Promo Card */}
            <div className="relative bg-blue-50 rounded-card p-3">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-blue-600 flex-shrink-0" />
                <span className="text-xs font-medium text-navy">Sync is active</span>
              </div>
              <span className="absolute top-2 right-2 text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-pill">NEW</span>
            </div>
            {/* Session Status Card */}
            <div className="border border-line rounded-card p-3">
              <div className="text-[11px] text-gray-soft mb-1">Session status</div>
              <div className="text-sm font-bold text-green">Active</div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top Header */}
        <header className="hidden md:flex items-center h-[58px] px-6 bg-white border-b border-line gap-4">
          {/* Hamburger toggles relative drawer */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 text-gray-soft hover:text-navy hover:bg-paper rounded-control transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Menu size={18} />
          </button>

          {/* Search Bar */}
          <form onSubmit={handleTopSearch} className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft" />
            <input
              type="text"
              value={topSearch}
              onChange={(e) => setTopSearch(e.target.value)}
              placeholder="Search medicines, receipt # (INV-…)..."
              className="w-full pl-9 pr-12 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-soft bg-paper border border-line px-1.5 py-0.5 rounded font-mono">Enter</kbd>
          </form>

          {/* POS Button */}
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-control text-sm font-medium shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition"
          >
            <ShoppingCart size={15} />
            POS
          </Link>

          {/* Add New Button */}
          {createItems.length > 0 && (
            <DropdownMenu
              ariaLabel="Add new"
              triggerContent={
                <>
                  <Plus size={15} />
                  Add New
                </>
              }
              triggerClassName="inline-flex items-center gap-2 px-4 py-2 bg-navy hover:bg-navy/90 text-white rounded-control text-sm font-medium transition"
            >
              {(close) =>
                CREATE_GROUPS.map((group) => {
                  const items = createItems.filter((item) => item.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div
                      key={group}
                      className="mt-1 border-t border-line pt-1 first:mt-0 first:border-0 first:pt-0"
                    >
                      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-soft">
                        {group}
                      </div>
                      {items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <NavLink
                            key={item.label}
                            to={item.to}
                            onClick={close}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-control text-sm text-navy hover:bg-paper transition"
                          >
                            <Icon size={15} className="text-gray flex-shrink-0" />
                            {item.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  );
                })
              }
            </DropdownMenu>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          <div className="flex items-center gap-3">
            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-soft hover:text-navy hover:bg-paper rounded-control transition"
              title="Refresh"
              aria-label="Refresh page"
            >
              <RefreshCw size={18} />
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <NotificationBell />
            </div>

            <div className="w-px h-8 bg-line" />

            {/* User Avatar */}
            <div className="flex items-center gap-3">
              <UserAvatar src={user?.profilePicture} name={user?.name ?? "U"} size="sm" />
              <div className="text-right">
                <div className="text-sm font-medium text-navy">{user?.name}</div>
                <div className="text-[11px] text-gray-soft capitalize">{user?.role.replace("_", " ")}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-line">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 -ml-1 text-gray hover:text-navy focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Pill size={14} className="text-white" />
            </div>
            <span className="font-sans font-bold text-[13.5px] tracking-wide text-navy uppercase truncate" title={pharmacyName}>{pharmacyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-1 text-gray-soft hover:text-navy transition"
              title="Refresh"
              aria-label="Refresh page"
            >
              <RefreshCw size={17} />
            </button>
            <NotificationBell />
            <UserAvatar src={user?.profilePicture} name={user?.name ?? "U"} size="sm" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-content-bg">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-line flex justify-around py-2 safe-area-bottom" aria-label="Mobile navigation">
          {NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.roles.includes(userRole)).slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded ${
                  isActive ? "text-blue-600" : "text-gray-soft"
                }`
              }
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span className="truncate max-w-[4rem]">{item.label.split(" ")[0]}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sign Out Confirmation Dialog */}
      {showSignOut && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-card shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-bg flex items-center justify-center flex-shrink-0">
                <LogOut size={18} className="text-red" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-navy">Sign out</h3>
                <p className="text-xs text-gray-soft mt-0.5">Are you sure you want to sign out?</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSignOut(false)}
                className="px-4 py-2 text-xs font-medium text-gray hover:text-navy bg-paper hover:bg-line rounded-control transition"
              >
                Cancel
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-control transition shadow-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

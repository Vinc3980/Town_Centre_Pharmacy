import { Outlet, Link, useLocation } from "react-router-dom";
import { usePharmacyName } from "../hooks/usePharmacyName";

export default function MainLayout() {
  const { pathname } = useLocation();
  const pharmacyName = usePharmacyName();
  return (
    <div className="min-h-screen bg-content-bg flex flex-col">
      <header className="bg-ink-900 text-white px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl tracking-tight">{pharmacyName}</Link>
        <span className="text-pine-200/60 text-xs uppercase tracking-wider">{pathname}</span>
      </header>
      <main className="flex-1 p-6 md:p-8">
        <Outlet />
      </main>
      <footer className="px-6 py-3 text-center text-xs text-ink-900/40 border-t border-sand-200">
        {pharmacyName} Management System — Foundation
      </footer>
    </div>
  );
}

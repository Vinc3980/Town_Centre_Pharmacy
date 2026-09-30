import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { useAuth } from "./context/AuthContext";

const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const POS = React.lazy(() => import("./pages/POS"));
const Activity = React.lazy(() => import("./pages/Activity"));
const Audit = React.lazy(() => import("./pages/Audit"));
const SalesList = React.lazy(() => import("./pages/SalesList"));
const SaleDetailPage = React.lazy(() => import("./pages/SaleDetail"));
const RefundApproval = React.lazy(() => import("./pages/RefundApproval"));
const ExpenseList = React.lazy(() => import("./pages/ExpenseList"));
const ExpenseForm = React.lazy(() => import("./pages/ExpenseForm"));
const DailyClosing = React.lazy(() => import("./pages/DailyClosing"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Health = React.lazy(() => import("./pages/Health"));
const UserManagement = React.lazy(() => import("./pages/UserManagement"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const InventoryAlerts = React.lazy(() => import("./pages/InventoryAlerts"));
const MedicineList = React.lazy(() => import("./pages/MedicineList"));
const CustomerList = React.lazy(() => import("./pages/CustomerList"));
const CustomerDetail = React.lazy(() => import("./pages/CustomerDetail"));
const StockTransfer = React.lazy(() => import("./pages/StockTransfer"));
const StockAdjustment = React.lazy(() => import("./pages/StockAdjustment"));
const PurchaseOrders = React.lazy(() => import("./pages/PurchaseOrders"));
const StaffPerformance = React.lazy(() => import("./pages/StaffPerformance"));
const BusinessOverview = React.lazy(() => import("./pages/BusinessOverview"));
const Branches = React.lazy(() => import("./pages/Branches"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-content-bg flex items-center justify-center text-ink-900/40 text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-content-bg flex items-center justify-center">
      <div className="text-sm text-ink-900/40">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<Suspense fallback={<LoadingFallback />}><ForgotPassword /></Suspense>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense>} />
        <Route path="overview" element={<Suspense fallback={<LoadingFallback />}><BusinessOverview /></Suspense>} />
        <Route path="staff-performance" element={<Suspense fallback={<LoadingFallback />}><StaffPerformance /></Suspense>} />
        <Route path="pos" element={<Suspense fallback={<LoadingFallback />}><POS /></Suspense>} />
        <Route path="sales" element={<Suspense fallback={<LoadingFallback />}><SalesList /></Suspense>} />
        <Route path="sales/:id" element={<Suspense fallback={<LoadingFallback />}><SaleDetailPage /></Suspense>} />
        <Route path="refunds" element={<Suspense fallback={<LoadingFallback />}><RefundApproval /></Suspense>} />
        <Route path="expenses" element={<Suspense fallback={<LoadingFallback />}><ExpenseList /></Suspense>} />
        <Route path="expenses/new" element={<Suspense fallback={<LoadingFallback />}><ExpenseForm /></Suspense>} />
        <Route path="daily-session" element={<Suspense fallback={<LoadingFallback />}><DailyClosing /></Suspense>} />
        <Route path="inventory-alerts" element={<Suspense fallback={<LoadingFallback />}><InventoryAlerts /></Suspense>} />
        <Route path="medicines" element={<Suspense fallback={<LoadingFallback />}><MedicineList /></Suspense>} />
        <Route path="customers" element={<Suspense fallback={<LoadingFallback />}><CustomerList /></Suspense>} />
        <Route path="customers/:id" element={<Suspense fallback={<LoadingFallback />}><CustomerDetail /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<LoadingFallback />}><Reports /></Suspense>} />
        <Route path="activity" element={<Suspense fallback={<LoadingFallback />}><Activity /></Suspense>} />
        <Route path="audit" element={<Suspense fallback={<LoadingFallback />}><Audit /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<LoadingFallback />}><Settings /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<LoadingFallback />}><UserManagement /></Suspense>} />
        <Route path="branches" element={<Suspense fallback={<LoadingFallback />}><Branches /></Suspense>} />
        <Route path="stock-transfer" element={<Suspense fallback={<LoadingFallback />}><StockTransfer /></Suspense>} />
        <Route path="stock-adjustment" element={<Suspense fallback={<LoadingFallback />}><StockAdjustment /></Suspense>} />
        <Route path="purchases" element={<Suspense fallback={<LoadingFallback />}><ExpenseList /></Suspense>} />
        <Route path="purchase-orders" element={<Suspense fallback={<LoadingFallback />}><PurchaseOrders /></Suspense>} />
        <Route path="health" element={<Suspense fallback={<LoadingFallback />}><Health /></Suspense>} />
      </Route>
    </Routes>
  );
}

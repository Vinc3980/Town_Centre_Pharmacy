import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  openSession,
  closeSession,
  getCurrentSession,
  listSessions,
  listPendingSessions,
  getSessionSales,
  approveSession,
  approveSessionClose,
  rejectSession,
  rejectSessionClose,
} from "../api/daily";
import { DailySession, SaleDetail } from "../types";
import Toast from "../components/ui/Toast";
import GlowIcon from "../components/ui/GlowIcon";

export default function DailyClosing() {
  const { user } = useAuth();
  const isManager = user?.role === "branch_manager" || user?.role === "admin";

  const [currentSession, setCurrentSession] = useState<DailySession | null>(null);
  const [history, setHistory] = useState<DailySession[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DailySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "sessions" | "approvals">("active");
  const [submitting, setSubmitting] = useState(false);

  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [actualMobileMoney, setActualMobileMoney] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [actualBankTransfer, setActualBankTransfer] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionSales, setSessionSales] = useState<SaleDetail[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [sessionTab, setSessionTab] = useState<"details" | "transactions">("details");

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [receiptSearch, setReceiptSearch] = useState("");
  const [viewingSale, setViewingSale] = useState<SaleDetail | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [current, sessions, pending] = await Promise.all([
        getCurrentSession(),
        listSessions(),
        isManager ? listPendingSessions() : Promise.resolve([]),
      ]);
      setCurrentSession(current);
      setHistory(sessions);
      setPendingApprovals(pending);
    } catch {
      setError("Failed to load daily session data");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenSession() {
    try {
      setSubmitting(true);
      setError("");
      const cash = parseFloat(openingCash);
      if (isNaN(cash) || cash < 0) throw new Error("Enter a valid amount");
      const session = await openSession(cash);
      setCurrentSession(session);
      setOpeningCash("");
      setToast({ message: "Session opened successfully", type: "success" });
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to open session");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseSession() {
    try {
      setSubmitting(true);
      setError("");
      const cash = parseFloat(actualCash);
      if (isNaN(cash) || cash < 0) throw new Error("Enter a valid cash amount");
      const session = await closeSession(cash, {
        actualMobileMoney: parseFloat(actualMobileMoney) || 0,
        actualCard: parseFloat(actualCard) || 0,
        actualBankTransfer: parseFloat(actualBankTransfer) || 0,
        notes: closeNotes || undefined,
      });
      setCurrentSession(session);
      setActualCash("");
      setActualMobileMoney("");
      setActualCard("");
      setActualBankTransfer("");
      setCloseNotes("");
      setToast({ message: "Session close request submitted", type: "success" });
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to close session");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(sessionId: string, status: string) {
    try {
      setSubmitting(true);
      if (status === "pending_approval") {
        await approveSession(sessionId);
      } else {
        await approveSessionClose(sessionId);
      }
      await loadData();
      setExpandedSession(null);
      setSessionSales([]);
      setToast({ message: "Session approved", type: "success" });
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(sessionId: string, status: string) {
    if (!rejectReason.trim()) return;
    try {
      setSubmitting(true);
      if (status === "pending_approval") {
        await rejectSession(sessionId, rejectReason);
      } else {
        await rejectSessionClose(sessionId, rejectReason);
      }
      await loadData();
      setRejectId(null);
      setRejectReason("");
      setExpandedSession(null);
      setSessionSales([]);
      setToast({ message: "Session rejected", type: "success" });
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to reject");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSessionExpand(sessionId: string) {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setSessionSales([]);
      setSessionTab("details");
      return;
    }
    setExpandedSession(sessionId);
    setSessionTab("details");
    try {
      setLoadingSales(true);
      const sales = await getSessionSales(sessionId);
      setSessionSales(sales);
    } catch {
      setSessionSales([]);
    } finally {
      setLoadingSales(false);
    }
  }

  function formatCurrency(amount: number) {
    return `GH₵ ${amount.toFixed(2)}`;
  }

  function getPaymentMethodLabel(method: string) {
    switch (method) {
      case "cash": return "Cash";
      case "mobile_money": return "Mobile Money";
      case "card": return "Card";
      case "bank_transfer": return "Bank Transfer";
      case "credit": return "Credit";
      default: return method;
    }
  }

  function getPaymentBreakdown(payments: { method: string; amount: number }[]) {
    const breakdown: Record<string, number> = {};
    for (const p of payments) {
      breakdown[p.method] = (breakdown[p.method] || 0) + p.amount;
    }
    return breakdown;
  }

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-transparent">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-soft font-sans text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-navy">Daily Session</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-control bg-red-bg border border-red text-red text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-line">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "active"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray hover:text-navy"
          }`}
        >
          Active Session
        </button>
        <button
          onClick={() => setTab("sessions")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "sessions"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray hover:text-navy"
          }`}
        >
          Session History
        </button>
        {isManager && (
          <button
            onClick={() => setTab("approvals")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
              tab === "approvals"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray hover:text-navy"
            }`}
          >
            Pending Approvals
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red text-white text-[10px] font-bold rounded-pill flex items-center justify-center">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ─── Active Session Tab ─── */}
      {tab === "active" && (
        <div>
          {currentSession?.status === "open" && (
            <div className="space-y-6">
              {/* ─── Open Session Indicator ─── */}
              <div className="bg-[#EAFBEF] border border-green rounded-card p-4 flex items-center gap-3">
                <GlowIcon tone="green" size={38} icon={<div className="w-3 h-3 bg-green rounded-pill animate-pulse" />} />
                <div>
                  <p className="text-sm font-semibold text-navy">Session Open</p>
                  <p className="text-xs text-gray mt-0.5">
                    Opened at {new Date(currentSession.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* ─── Payment Methods: Expected vs Actual ─── */}
              <div className="bg-white rounded-card border border-line-soft shadow-panel p-5 space-y-4">
                <h3 className="font-sans font-semibold text-navy text-sm">
                  Close Session — Enter Actual Amounts
                </h3>

                {/* Cash row */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray mb-1">Actual Cash in Drawer</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft text-sm">GH₵</span>
                      <input
                        type="number"
                        value={actualCash}
                        onChange={(e) => setActualCash(e.target.value)}
                        className="w-full pl-12 pr-3 py-2 rounded-control border border-line text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile Money */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray mb-1">Actual Mobile Money</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft text-sm">GH₵</span>
                      <input
                        type="number"
                        value={actualMobileMoney}
                        onChange={(e) => setActualMobileMoney(e.target.value)}
                        className="w-full pl-12 pr-3 py-2 rounded-control border border-line text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Card */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray mb-1">Actual Card</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft text-sm">GH₵</span>
                      <input
                        type="number"
                        value={actualCard}
                        onChange={(e) => setActualCard(e.target.value)}
                        className="w-full pl-12 pr-3 py-2 rounded-control border border-line text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Transfer */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray mb-1">Actual Bank Transfer</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft text-sm">GH₵</span>
                      <input
                        type="number"
                        value={actualBankTransfer}
                        onChange={(e) => setActualBankTransfer(e.target.value)}
                        className="w-full pl-12 pr-3 py-2 rounded-control border border-line text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray mb-1">Notes (optional)</label>
                  <input
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-control border border-line text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    placeholder="Any discrepancies or notes..."
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleCloseSession}
                    disabled={submitting}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-control text-sm font-semibold shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition-colors"
                  >
                    {submitting ? "Submitting..." : "Request Session Close"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentSession?.status === "pending_approval" && (
            <div className="bg-white rounded-card border border-line-soft shadow-panel p-6 text-center">
              <GlowIcon tone="gold" size={48} className="mx-auto mb-3" icon={<svg className="w-6 h-6 text-amber animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>} />
              <p className="font-sans font-semibold text-navy">Awaiting Manager Approval</p>
              <p className="text-sm text-gray mt-1">
                Your session open request is pending approval
              </p>
            </div>
          )}

          {currentSession?.status === "pending_close_approval" && (
            <div className="bg-white rounded-card border border-line-soft shadow-panel p-6 text-center">
              <GlowIcon tone="blue" size={48} className="mx-auto mb-3" icon={<svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>} />
              <p className="font-sans font-semibold text-navy">Close Request Pending Approval</p>
              <p className="text-sm text-gray mt-1">
                Your session close request is awaiting manager review
              </p>
            </div>
          )}

          {!currentSession && (
            <div className="bg-white rounded-card border border-line-soft shadow-panel p-6 text-center space-y-4">
              <GlowIcon tone="blue" size={48} className="mx-auto" icon={<svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>} />
              <div>
                <p className="text-sm font-semibold text-navy">No Active Session</p>
                <p className="text-xs text-gray mt-1">Start your day by opening a new session.</p>
              </div>
              <div className="max-w-xs mx-auto space-y-3">
                <input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-control border border-line text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  placeholder="Opening cash amount (GH₵)"
                  min="0"
                  step="0.01"
                />
                <button
                  onClick={handleOpenSession}
                  disabled={submitting}
                  className="w-full px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-control text-sm font-semibold shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition-colors"
                >
                  {submitting ? "Opening..." : "Open Session"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Session History Tab ─── */}
      {tab === "sessions" && (
        <div className="space-y-3">
          {history.length === 0 && (
            <div className="bg-white rounded-card border border-line-soft shadow-panel p-6 text-center">
              <GlowIcon tone="blue" size={38} className="mx-auto mb-3" icon={<svg className="w-5 h-5 text-gray-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>} />
              <p className="text-sm text-gray">No session history yet.</p>
            </div>
          )}

          {history.map((session) => {
            const isOpen = expandedSession === session._id;
            const aggregates = session.closeAggregates;
            const statusColors: Record<string, string> = {
              open: "bg-[#EAFBEF] text-green border-green",
              pending_approval: "bg-amber-bg text-amber border-amber-200",
              pending_close_approval: "bg-blue-50 text-blue-700 border-blue-500",
              closed: "bg-paper text-gray border-line",
            };
            const statusLabels: Record<string, string> = {
              open: "Open",
              pending_approval: "Pending Approval",
              pending_close_approval: "Close Pending",
              closed: "Closed",
            };

            return (
              <div key={session._id} className="bg-white rounded-card border border-line-soft shadow-panel">
                {/* Session row */}
                <button
                  onClick={() => toggleSessionExpand(session._id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-paper transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-sans font-medium text-navy text-sm">
                        {new Date(session.date).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-gray-soft mt-0.5">
                        Opened: {formatCurrency(session.openingCash)}
                        {aggregates && ` · Sales: ${formatCurrency(aggregates.totalSales)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-pill text-[11px] font-semibold border ${statusColors[session.status] || ""}`}>
                      {statusLabels[session.status] || session.status}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded details */}
                {isOpen && aggregates && (
                  <div className="px-5 pb-5 border-t border-line">
                    {/* Sub-tabs */}
                    <div className="flex gap-2 mt-4 mb-4 border-b border-line">
                      <button
                        onClick={() => setSessionTab("details")}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                          sessionTab === "details"
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-soft hover:text-gray"
                        }`}
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => setSessionTab("transactions")}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                          sessionTab === "transactions"
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-soft hover:text-gray"
                        }`}
                      >
                        Transactions ({sessionSales.length})
                      </button>
                    </div>

                    {sessionTab === "details" && (
                      <div className="space-y-4">
                        {/* Payment method breakdown */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Cash", expected: aggregates.cashSales, actual: aggregates.actualCash },
                            { label: "Mobile Money", expected: aggregates.mobileMoneySales, actual: aggregates.actualMobileMoney },
                            { label: "Card", expected: aggregates.cardSales, actual: aggregates.actualCard },
                            { label: "Bank Transfer", expected: aggregates.bankTransferSales, actual: aggregates.actualBankTransfer },
                          ].map((item) => {
                            const diff = (item.actual || 0) - item.expected;
                            return (
                              <div key={item.label} className="bg-paper rounded-control p-3 space-y-1">
                                <p className="text-[11px] text-gray font-medium">{item.label}</p>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray">Expected:</span>
                                  <span className="font-semibold tabular-nums">{formatCurrency(item.expected)}</span>
                                </div>
                                {item.actual !== undefined && item.actual > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray">Actual:</span>
                                    <span className="font-semibold tabular-nums">{formatCurrency(item.actual)}</span>
                                  </div>
                                )}
                                {item.actual !== undefined && item.actual > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray">Variance:</span>
                                    <span className={`font-semibold tabular-nums ${diff === 0 ? "text-green" : diff > 0 ? "text-green" : "text-red"}`}>
                                      {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Totals */}
                        <div className="bg-paper rounded-control p-3 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Total Sales</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.totalSales)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Refunds</span>
                            <span className="font-semibold tabular-nums text-red">{formatCurrency(aggregates.refunds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Expenses</span>
                            <span className="font-semibold tabular-nums text-red">{formatCurrency(aggregates.expenses)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Discounts</span>
                            <span className="font-semibold tabular-nums text-amber">{formatCurrency(aggregates.discounts)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-semibold">
                            <span className="text-navy">Net</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.totalSales - aggregates.refunds - aggregates.expenses)}</span>
                          </div>
                        </div>

                        {/* Cash reconciliation */}
                        <div className="bg-paper rounded-control p-3 space-y-2">
                          <p className="text-xs font-semibold text-navy mb-2">Cash Drawer</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Opening Cash</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(session.openingCash)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">+ Cash Sales</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashSales)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">- Cash Refunds</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashRefunds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">- Cash Expenses</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashExpenses)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-semibold">
                            <span className="text-navy">Expected Cash</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.expectedCash)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-navy">Actual Cash</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.actualCash)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-bold">
                            <span className="text-navy">Cash Variance</span>
                            <span className={`tabular-nums ${aggregates.variance === 0 ? "text-green" : aggregates.variance > 0 ? "text-green" : "text-red"}`}>
                              {aggregates.variance >= 0 ? "+" : ""}{formatCurrency(aggregates.variance)}
                            </span>
                          </div>
                        </div>

                        {session.closedAt && (
                          <p className="text-xs text-gray-soft">
                            Closed at {new Date(session.closedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}

                    {sessionTab === "transactions" && (
                      <div>
                        {loadingSales ? (
                          <div className="text-center py-8 text-gray-soft text-sm">Loading transactions...</div>
                        ) : sessionSales.length === 0 ? (
                          <div className="text-center py-8 text-gray-soft text-sm">No transactions for this session</div>
                        ) : (
                          <div>
                            <div className="mb-3">
                              <input
                                type="text"
                                value={receiptSearch}
                                onChange={(e) => setReceiptSearch(e.target.value)}
                                placeholder="Search by receipt number..."
                                className="w-full px-3 py-2 rounded-control border border-line text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                              />
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {sessionSales
                                .filter((sale) =>
                                  !receiptSearch || sale.transactionNumber.toLowerCase().includes(receiptSearch.toLowerCase())
                                )
                                .map((sale) => {
                                  const breakdown = getPaymentMethodLabel(sale.paymentMethod);
                                  return (
                                    <button
                                      key={sale._id}
                                      onClick={() => setViewingSale(sale)}
                                      className="w-full flex items-center justify-between py-2.5 border-b border-paper last:border-0 hover:bg-paper rounded-control px-2 transition-colors text-left"
                                    >
                                      <div>
                                        <p className="text-sm font-medium text-navy">{sale.transactionNumber}</p>
                                        <p className="text-xs text-gray-soft">
                                          {new Date(sale.createdAt).toLocaleTimeString()} · {breakdown}
                                          {sale.customer && ` · ${(sale.customer as any).name}`}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold tabular-nums ${sale.status === "partially_refunded" ? "text-amber" : "text-navy"}`}>
                                          {formatCurrency(sale.total)}
                                        </span>
                                        <svg className="w-4 h-4 text-gray-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Pending Approvals Tab ─── */}
      {tab === "approvals" && isManager && (
        <div className="space-y-3">
          {pendingApprovals.length === 0 && (
            <div className="bg-white rounded-card border border-line-soft shadow-panel p-6 text-center">
              <GlowIcon tone="green" size={38} className="mx-auto mb-3" icon={<svg className="w-5 h-5 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>} />
              <p className="font-sans font-medium text-navy">All caught up</p>
              <p className="text-sm text-gray mt-1">No pending session approvals</p>
            </div>
          )}

          {pendingApprovals.map((session) => {
            const aggregates = session.closeAggregates;
            const isOpen = expandedSession === session._id;
            const isCloseRequest = session.status === "pending_close_approval";
            const sessionUser = typeof session.user === "object" ? session.user : { name: "Unknown", staffId: "" };

            return (
              <div key={session._id} className="bg-white rounded-card border border-line-soft shadow-panel">
                {/* Session row */}
                <button
                  onClick={() => toggleSessionExpand(session._id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-paper transition-colors text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-sans font-medium text-navy text-sm">{sessionUser.name}</p>
                      {sessionUser.staffId && (
                        <span className="text-[11px] text-gray-soft font-mono">({sessionUser.staffId})</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border ${
                        isCloseRequest ? "bg-blue-50 text-blue-700 border-blue-500" : "bg-amber-bg text-amber border-amber-200"
                      }`}>
                        {isCloseRequest ? "Close Request" : "Open Request"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-soft mt-0.5">
                      {new Date(session.date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {aggregates && ` · Sales: ${formatCurrency(aggregates.totalSales)}`}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-line">
                    {/* Sub-tabs */}
                    <div className="flex gap-2 mt-4 mb-4 border-b border-line">
                      <button
                        onClick={() => setSessionTab("details")}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                          sessionTab === "details"
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-soft hover:text-gray"
                        }`}
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => setSessionTab("transactions")}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                          sessionTab === "transactions"
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-soft hover:text-gray"
                        }`}
                      >
                        Transactions ({sessionSales.length})
                      </button>
                    </div>

                    {sessionTab === "details" && aggregates && (
                      <div className="space-y-4">
                        {/* Payment method breakdown */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Cash", expected: aggregates.cashSales, actual: aggregates.actualCash },
                            { label: "Mobile Money", expected: aggregates.mobileMoneySales, actual: aggregates.actualMobileMoney },
                            { label: "Card", expected: aggregates.cardSales, actual: aggregates.actualCard },
                            { label: "Bank Transfer", expected: aggregates.bankTransferSales, actual: aggregates.actualBankTransfer },
                          ].map((item) => {
                            const diff = (item.actual || 0) - item.expected;
                            return (
                              <div key={item.label} className="bg-paper rounded-control p-3 space-y-1">
                                <p className="text-[11px] text-gray font-medium">{item.label}</p>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray">Expected:</span>
                                  <span className="font-semibold tabular-nums">{formatCurrency(item.expected)}</span>
                                </div>
                                {item.actual !== undefined && item.actual > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray">Actual:</span>
                                    <span className="font-semibold tabular-nums">{formatCurrency(item.actual)}</span>
                                  </div>
                                )}
                                {item.actual !== undefined && item.actual > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray">Variance:</span>
                                    <span className={`font-semibold tabular-nums ${diff === 0 ? "text-green" : diff > 0 ? "text-green" : "text-red"}`}>
                                      {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Totals */}
                        <div className="bg-paper rounded-control p-3 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Total Sales</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.totalSales)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Refunds</span>
                            <span className="font-semibold tabular-nums text-red">{formatCurrency(aggregates.refunds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Expenses</span>
                            <span className="font-semibold tabular-nums text-red">{formatCurrency(aggregates.expenses)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Discounts</span>
                            <span className="font-semibold tabular-nums text-amber">{formatCurrency(aggregates.discounts)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-semibold">
                            <span className="text-navy">Net</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.totalSales - aggregates.refunds - aggregates.expenses)}</span>
                          </div>
                        </div>

                        {/* Cash reconciliation */}
                        <div className="bg-paper rounded-control p-3 space-y-2">
                          <p className="text-xs font-semibold text-navy mb-2">Cash Drawer</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">Opening Cash</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(session.openingCash)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">+ Cash Sales</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashSales)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">- Cash Refunds</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashRefunds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray">- Cash Expenses</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(aggregates.cashExpenses)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-semibold">
                            <span className="text-navy">Expected Cash</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.expectedCash)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-navy">Actual Cash</span>
                            <span className="tabular-nums">{formatCurrency(aggregates.actualCash)}</span>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-sm font-bold">
                            <span className="text-navy">Cash Variance</span>
                            <span className={`tabular-nums ${aggregates.variance === 0 ? "text-green" : aggregates.variance > 0 ? "text-green" : "text-red"}`}>
                              {aggregates.variance >= 0 ? "+" : ""}{formatCurrency(aggregates.variance)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {sessionTab === "transactions" && (
                      <div>
                        {loadingSales ? (
                          <div className="text-center py-8 text-gray-soft text-sm">Loading transactions...</div>
                        ) : sessionSales.length === 0 ? (
                          <div className="text-center py-8 text-gray-soft text-sm">No transactions for this session</div>
                        ) : (
                          <div>
                            <div className="mb-3">
                              <input
                                type="text"
                                value={receiptSearch}
                                onChange={(e) => setReceiptSearch(e.target.value)}
                                placeholder="Search by receipt number..."
                                className="w-full px-3 py-2 rounded-control border border-line text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                              />
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {sessionSales
                                .filter((sale) =>
                                  !receiptSearch || sale.transactionNumber.toLowerCase().includes(receiptSearch.toLowerCase())
                                )
                                .map((sale) => {
                                  const breakdown = getPaymentMethodLabel(sale.paymentMethod);
                                  return (
                                    <button
                                      key={sale._id}
                                      onClick={() => setViewingSale(sale)}
                                      className="w-full flex items-center justify-between py-2.5 border-b border-paper last:border-0 hover:bg-paper rounded-control px-2 transition-colors text-left"
                                    >
                                      <div>
                                        <p className="text-sm font-medium text-navy">{sale.transactionNumber}</p>
                                        <p className="text-xs text-gray-soft">
                                          {new Date(sale.createdAt).toLocaleTimeString()} · {breakdown}
                                          {sale.customer && ` · ${(sale.customer as any).name}`}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold tabular-nums ${sale.status === "partially_refunded" ? "text-amber" : "text-navy"}`}>
                                          {formatCurrency(sale.total)}
                                        </span>
                                        <svg className="w-4 h-4 text-gray-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    {isCloseRequest ? (
                      <div className="flex gap-3 mt-4 pt-4 border-t border-line">
                        {rejectId === session._id ? (
                          <div className="flex gap-2 flex-1">
                            <input
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason for rejection..."
                              className="flex-1 px-3 py-2 rounded-control border border-red text-sm focus:outline-none focus:ring-2 focus:ring-red-bg0/20"
                            />
                            <button
                              onClick={() => handleReject(session._id, session.status)}
                              disabled={!rejectReason.trim() || submitting}
                              className="px-4 py-2 bg-red hover:bg-red disabled:opacity-50 text-white rounded-control text-sm font-semibold transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setRejectId(null); setRejectReason(""); }}
                              className="px-4 py-2 bg-paper hover:bg-line text-navy rounded-control text-sm font-semibold transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApprove(session._id, session.status)}
                              disabled={submitting}
                              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-control text-sm font-semibold shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition-colors"
                            >
                              Approve Close
                            </button>
                            <button
                              onClick={() => setRejectId(session._id)}
                              className="flex-1 px-4 py-2.5 bg-white border border-red text-red hover:bg-red-bg rounded-control text-sm font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-3 mt-4 pt-4 border-t border-line">
                        {rejectId === session._id ? (
                          <div className="flex gap-2 flex-1">
                            <input
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason for rejection..."
                              className="flex-1 px-3 py-2 rounded-control border border-red text-sm focus:outline-none focus:ring-2 focus:ring-red-bg0/20"
                            />
                            <button
                              onClick={() => handleReject(session._id, session.status)}
                              disabled={!rejectReason.trim() || submitting}
                              className="px-4 py-2 bg-red hover:bg-red disabled:opacity-50 text-white rounded-control text-sm font-semibold transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setRejectId(null); setRejectReason(""); }}
                              className="px-4 py-2 bg-paper hover:bg-line text-navy rounded-control text-sm font-semibold transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApprove(session._id, session.status)}
                              disabled={submitting}
                              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-control text-sm font-semibold shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectId(session._id)}
                              className="flex-1 px-4 py-2.5 bg-white border border-red text-red hover:bg-red-bg rounded-control text-sm font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Transaction Detail Modal ─── */}
      {viewingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewingSale(null)}>
          <div className="bg-white rounded-card shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h3 className="font-sans font-semibold text-navy">{viewingSale.transactionNumber}</h3>
                <p className="text-xs text-gray-soft mt-0.5">
                  {new Date(viewingSale.createdAt).toLocaleString()} · {getPaymentMethodLabel(viewingSale.paymentMethod)}
                </p>
              </div>
              <button onClick={() => setViewingSale(null)} className="p-1.5 hover:bg-paper rounded-control transition-colors">
                <svg className="w-5 h-5 text-gray-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Customer & Cashier */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray text-xs mb-1">Customer</p>
                  <p className="font-medium text-navy">
                    {viewingSale.customer ? (viewingSale.customer as any).name : "Walk-in"}
                  </p>
                </div>
                <div>
                  <p className="text-gray text-xs mb-1">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-pill text-[11px] font-semibold ${
                    viewingSale.status === "completed" ? "bg-[#EAFBEF] text-green" : "bg-amber-bg text-amber"
                  }`}>
                    {viewingSale.status === "completed" ? "Completed" : "Partially Refunded"}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-gray text-xs mb-2">Items</p>
                <div className="border border-line rounded-control overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-paper text-left">
                        <th className="px-3 py-2 text-xs font-medium text-gray">Product</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray text-right">Qty</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray text-right">Price</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-paper">
                      {viewingSale.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-navy">{item.name}</p>
                            <p className="text-[11px] text-gray-soft">{item.batch}</p>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-paper rounded-control p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray">Subtotal</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(viewingSale.subtotal)}</span>
                </div>
                {viewingSale.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray">Discount</span>
                    <span className="font-semibold tabular-nums text-amber">-{formatCurrency(viewingSale.discount)}</span>
                  </div>
                )}
                {viewingSale.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray">Tax</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(viewingSale.tax)}</span>
                  </div>
                )}
                <div className="border-t border-line pt-2 flex justify-between font-bold">
                  <span className="text-navy">Total</span>
                  <span className="tabular-nums">{formatCurrency(viewingSale.total)}</span>
                </div>
              </div>

              {/* Payment */}
              <div>
                <p className="text-gray text-xs mb-2">Payment</p>
                <div className="space-y-1.5 text-sm">
                  {viewingSale.payments.map((p, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-gray">{getPaymentMethodLabel(p.method)}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
                {viewingSale.amountReceived !== undefined && (
                  <div className="flex justify-between mt-2 pt-2 border-t border-line text-sm">
                    <span className="text-gray">Amount Received</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(viewingSale.amountReceived)}</span>
                  </div>
                )}
                {viewingSale.change !== undefined && viewingSale.change > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray">Change</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(viewingSale.change)}</span>
                  </div>
                )}
              </div>

              {/* Refund info */}
              {viewingSale.status === "partially_refunded" && viewingSale.refundedAmount && (
                <div className="bg-red-bg rounded-control p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-red">Refunded Amount</span>
                    <span className="font-semibold tabular-nums text-red">{formatCurrency(viewingSale.refundedAmount)}</span>
                  </div>
                  {viewingSale.refundReason && (
                    <p className="text-xs text-red mt-1">Reason: {viewingSale.refundReason}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

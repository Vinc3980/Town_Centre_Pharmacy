import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, X, Receipt } from "lucide-react";
import { listExpenses, approveExpense, rejectExpense } from "../api/expenses";
import { Expense } from "../types";
import { useAuth } from "../context/AuthContext";
import SearchInput from "../components/ui/SearchInput";
import Select from "../components/ui/Select";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Toast from "../components/ui/Toast";
import PageTabs from "../components/ui/PageTabs";
import { TableSkeleton } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "salaries", label: "Salaries" },
  { value: "transport", label: "Transport" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "insurance", label: "Insurance" },
  { value: "taxes", label: "Taxes" },
  { value: "misc", label: "Miscellaneous" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TABS = [
  { label: "All expenses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ExpenseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreateExpense = true;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses-list", search, status, category, from, to],
    queryFn: () => listExpenses({
      search: search || undefined,
      status: status || undefined,
      category: category || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
  });

  async function handleApprove(id: string) {
    try {
      await approveExpense(id);
      queryClient.invalidateQueries({ queryKey: ["expenses-list"] });
      setToast({ message: "Expense approved", type: "success" });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to approve";
      setToast({ message, type: "error" });
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    try {
      await rejectExpense(id, rejectReason);
      queryClient.invalidateQueries({ queryKey: ["expenses-list"] });
      setRejectingId(null);
      setRejectReason("");
      setToast({ message: "Expense rejected", type: "success" });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to reject";
      setToast({ message, type: "error" });
    }
  }

  return (
    <div className="space-y-0">
      <PageTabs tabs={TABS} activeTab={status} onChange={setStatus} />

      <div className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-navy">Expenses</h1>
          {canCreateExpense && (
            <Button onClick={() => navigate("/expenses/new")}>
              New expense
            </Button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 p-3 bg-white rounded-card border border-line flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description..."
            />
          </div>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={CATEGORY_OPTIONS}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-card border border-line overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : !expenses || expenses.length === 0 ? (
            <EmptyState
              icon={<Receipt size={24} className="text-gray-soft" />}
              title="No expenses found"
              description="Expenses will appear here once recorded."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden sm:table-cell" scope="col">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden md:table-cell" scope="col">Staff</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden lg:table-cell" scope="col">Payment</th>
                    <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {expenses.map((e: Expense) => (
                    <tr key={e._id} className="hover:bg-paper transition">
                      <td className="px-4 py-3 text-gray">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant="sand">{e.category.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-4 py-3 text-navy">{e.description}</td>
                      <td className="px-4 py-3 text-gray hidden md:table-cell">{typeof e.recordedBy === "object" ? e.recordedBy.name : ""}</td>
                      <td className="px-4 py-3 text-gray capitalize hidden lg:table-cell">{e.paymentMethod.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right font-medium text-navy tabular-nums">{ghs(e.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[e.status] ?? "sand"}>{e.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {e.status === "pending" && (
                          rejectingId === e._id ? (
                            <div className="flex gap-1 items-center">
                              <Input
                                value={rejectReason}
                                onChange={(ev) => setRejectReason(ev.target.value)}
                                placeholder="Reason"
                                className="w-28"
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleReject(e._id)}
                                disabled={!rejectReason.trim()}
                                icon={<Check size={14} />}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                icon={<X size={14} />}
                              />
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(e._id)}
                                icon={<Check size={14} />}
                                title="Approve"
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setRejectingId(e._id)}
                                icon={<X size={14} />}
                                title="Reject"
                              />
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

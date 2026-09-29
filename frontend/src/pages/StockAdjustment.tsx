import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X, Trash2, ArrowUp, ArrowDown, Package } from "lucide-react";
import { listAdjustments, createAdjustment, approveAdjustment, rejectAdjustment, deleteAdjustment } from "../api/stockAdjustments";
import { fetchMedicines } from "../api/medicines";
import { StockAdjustment, Medicine } from "../types";
import { useAuth } from "../context/AuthContext";
import SearchInput from "../components/ui/SearchInput";
import Select from "../components/ui/Select";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import Toast from "../components/ui/Toast";
import EmptyState from "../components/ui/EmptyState";
import { TableSkeleton } from "../components/ui/Skeleton";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "increase", label: "Increase" },
  { value: "decrease", label: "Decrease" },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export default function StockAdjustmentPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canApprove = user?.role === "branch_manager" || user?.role === "admin";
  const canManage = user?.permissions?.includes("manage_inventory");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [form, setForm] = useState({
    medicineId: "",
    medicineName: "",
    type: "increase" as "increase" | "decrease",
    quantity: "",
    reason: "",
    location: "",
    notes: "",
  });

  const [medicineSearch, setMedicineSearch] = useState("");
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);

  const { data: adjustments, isLoading } = useQuery({
    queryKey: ["stock-adjustments", search, status, type, page],
    queryFn: () => listAdjustments({
      search: search || undefined,
      status: status || undefined,
      type: type || undefined,
      page,
      limit: 15,
    }),
  });

  const { data: medicines } = useQuery({
    queryKey: ["medicines-search", medicineSearch],
    queryFn: () => fetchMedicines(medicineSearch),
    enabled: showMedicineDropdown,
  });

  const createMutation = useMutation({
    mutationFn: createAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setToast({ message: "Stock adjustment created", type: "success" });
      setShowCreate(false);
      resetForm();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to create adjustment", type: "error" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => approveAdjustment(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setToast({ message: "Adjustment approved and stock updated", type: "success" });
      setRejectingId(null);
      setReviewNotes("");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to approve", type: "error" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => rejectAdjustment(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setToast({ message: "Adjustment rejected", type: "success" });
      setRejectingId(null);
      setReviewNotes("");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to reject", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setToast({ message: "Adjustment deleted", type: "success" });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to delete", type: "error" });
    },
  });

  const resetForm = useCallback(() => {
    setForm({ medicineId: "", medicineName: "", type: "increase", quantity: "", reason: "", location: "", notes: "" });
    setMedicineSearch("");
    setShowMedicineDropdown(false);
  }, []);

  function handleSelectMedicine(med: Medicine) {
    setForm((f) => ({ ...f, medicineId: med._id, medicineName: med.name }));
    setMedicineSearch(med.name);
    setShowMedicineDropdown(false);
  }

  function handleSubmit() {
    if (!form.medicineId || !form.quantity || !form.reason || !form.location) return;
    createMutation.mutate({
      medicine: form.medicineId,
      type: form.type,
      quantity: parseInt(form.quantity, 10),
      reason: form.reason,
      location: form.location,
      notes: form.notes || undefined,
    });
  }

  function getMedicineName(item: StockAdjustment["medicine"]) {
    if (item && typeof item === "object") return item.name;
    if (item === null || item === undefined) return "Deleted product";
    return String(item);
  }

  function getUserName(item: StockAdjustment["requestedBy"]) {
    if (item && typeof item === "object") return item.name;
    if (item === null || item === undefined) return "Unknown user";
    return String(item);
  }

  const totalPages = adjustments ? Math.ceil(adjustments.pagination.total / adjustments.pagination.limit) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink-900">Stock Adjustment</h1>
          <p className="text-xs text-ink-900/45 mt-0.5">Manage inventory adjustments for damage, expiry, or count corrections</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            New Adjustment
          </Button>
        )}
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search reference or product..."
            />
          </div>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={STATUS_OPTIONS}
          />
          <Select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            options={TYPE_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={9} />
        ) : !adjustments?.data || adjustments.data.length === 0 ? (
          <EmptyState
            icon={<Package size={24} className="text-ink-900/30" />}
            title="No stock adjustments found"
            description="Create an adjustment to correct inventory counts."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-sand-200 text-ink-900/50 text-left">
                  <th className="px-4 py-3 font-medium" scope="col">Reference</th>
                  <th className="px-4 py-3 font-medium" scope="col">Product</th>
                  <th className="px-4 py-3 font-medium" scope="col">Type</th>
                  <th className="px-4 py-3 font-medium" scope="col">Qty</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell" scope="col">Reason</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell" scope="col">Location</th>
                  <th className="px-4 py-3 font-medium" scope="col">Status</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell" scope="col">Requested By</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell" scope="col">Date</th>
                  <th className="px-4 py-3 font-medium" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.data.map((adj: StockAdjustment) => (
                  <tr key={adj._id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-ink-900/70">{adj.referenceNumber}</td>
                    <td className="px-4 py-3 text-ink-900">{getMedicineName(adj.medicine)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={adj.type === "increase" ? "success" : "danger"}>
                        <span className="flex items-center gap-1">
                          {adj.type === "increase" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                          {adj.type}
                        </span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-900 tabular-nums">{adj.quantity}</td>
                    <td className="px-4 py-3 text-ink-900/60 hidden md:table-cell max-w-[150px] truncate">{adj.reason}</td>
                    <td className="px-4 py-3 text-ink-900/60 hidden lg:table-cell">{adj.location}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[adj.status] ?? "sand"}>{adj.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-900/60 hidden sm:table-cell">{getUserName(adj.requestedBy)}</td>
                    <td className="px-4 py-3 text-ink-900/60 hidden md:table-cell">
                      {new Date(adj.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {adj.status === "pending" && canApprove && (
                        rejectingId === adj._id ? (
                          <div className="flex gap-1 items-center">
                            <Input
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              placeholder="Notes (optional)"
                              className="w-32"
                            />
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: adj._id, notes: reviewNotes || undefined })}
                              icon={<Check size={14} />}
                              title="Approve"
                            />
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => rejectMutation.mutate({ id: adj._id, notes: reviewNotes || undefined })}
                              icon={<X size={14} />}
                              title="Reject"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => { setRejectingId(null); setReviewNotes(""); }}
                              icon={<X size={14} />}
                            />
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => { setRejectingId(adj._id); setReviewNotes(""); }}
                              icon={<Check size={14} />}
                              title="Review"
                            />
                          </div>
                        )
                      )}
                      {adj.status === "pending" && canManage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => deleteMutation.mutate(adj._id)}
                          icon={<Trash2 size={14} />}
                          title="Delete"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {adjustments && adjustments.pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-sand-200">
            <div className="text-xs text-ink-900/40">
              Showing {((page - 1) * 15) + 1}–{Math.min(page * 15, adjustments.pagination.total)} of {adjustments.pagination.total}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 rounded-lg text-xs font-medium transition text-ink-900/50 hover:bg-sand-100 disabled:opacity-40"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition ${
                      p === page ? "bg-orange-500 text-white" : "text-ink-900/50 hover:bg-sand-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-lg text-xs font-medium transition text-ink-900/50 hover:bg-sand-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="New Stock Adjustment" size="lg">
        <div className="space-y-4">
          <div className="relative">
            <Input
              label="Product"
              placeholder="Search product..."
              value={medicineSearch}
              onChange={(e) => {
                setMedicineSearch(e.target.value);
                setForm((f) => ({ ...f, medicineId: "", medicineName: "" }));
                setShowMedicineDropdown(true);
              }}
              onFocus={() => setShowMedicineDropdown(true)}
            />
            {showMedicineDropdown && medicines && medicines.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-sand-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {medicines.map((med) => (
                  <button
                    key={med._id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-sand-50 transition"
                    onClick={() => handleSelectMedicine(med)}
                  >
                    {med.name} <span className="text-ink-900/40 text-xs">({med.sku})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "increase" | "decrease" }))}
              options={[
                { value: "increase", label: "Increase (Found Stock)" },
                { value: "decrease", label: "Decrease (Damage/Expiry/Error)" },
              ]}
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              placeholder="0"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>

          <Input
            label="Reason"
            placeholder="e.g., Physical count correction, Damaged goods, Expired products"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />

          <Input
            label="Location"
            placeholder="e.g., Main Warehouse, Store Front"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink-900/60">Notes (optional)</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
              rows={3}
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.medicineId || !form.quantity || !form.reason || !form.location || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Adjustment"}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

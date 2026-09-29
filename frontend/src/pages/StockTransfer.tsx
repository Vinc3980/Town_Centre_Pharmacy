import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, ArrowRight, Trash2, CheckCircle, Truck, XCircle, Upload } from "lucide-react";
import {
  listTransfers,
  createTransfer,
  updateTransferStatus,
  deleteTransfer,
} from "../api/stockTransfers";
import { fetchMedicines } from "../api/medicines";
import { StockTransfer } from "../types";
import { useAuth } from "../context/AuthContext";
import SearchInput from "../components/ui/SearchInput";
import Select from "../components/ui/Select";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { TableSkeleton } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "amber",
  in_transit: "blue",
  completed: "green",
  cancelled: "red",
};

const LOCATION_OPTIONS = [
  { value: "Main Warehouse", label: "Main Warehouse" },
  { value: "Branch Store A", label: "Branch Store A" },
  { value: "Branch Store B", label: "Branch Store B" },
  { value: "Cold Storage", label: "Cold Storage" },
];

interface TransferProduct {
  medicine: string;
  medicineName: string;
  quantity: number;
}

const TOTAL_PAGES_PLACEHOLDER = 5;

export default function StockTransferPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("manage_inventory");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    status: "in_transit" | "completed" | "cancelled";
    label: string;
  } | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Batch upload state
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchRows, setBatchRows] = useState<{ productName: string; quantity: number; error?: string }[]>([]);

  // Create modal state
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [products, setProducts] = useState<TransferProduct[]>([]);
  const [notes, setNotes] = useState("");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineResults, setMedicineResults] = useState<{ _id: string; name: string; totalStock: number }[]>([]);
  const [searchingMedicine, setSearchingMedicine] = useState(false);

  const { data: transfersData, isLoading, isError, error } = useQuery({
    queryKey: ["stock-transfers", search, status, page],
    queryFn: () => listTransfers({ search: search || undefined, status: status || undefined, page, limit: 10 }),
  });

  const createMutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setShowCreate(false);
      resetCreateForm();
      setToast({ message: "Stock transfer created", type: "success" });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to create transfer", type: "error" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "in_transit" | "completed" | "cancelled" }) =>
      updateTransferStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setConfirmAction(null);
      setToast({ message: "Status updated", type: "success" });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to update status", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setDeleteConfirmId(null);
      setToast({ message: "Transfer deleted", type: "success" });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err.response?.data?.message ?? "Failed to delete transfer", type: "error" });
    },
  });

  function resetCreateForm() {
    setFromLocation("");
    setToLocation("");
    setProducts([]);
    setNotes("");
    setMedicineSearch("");
    setMedicineResults([]);
  }

  async function handleMedicineSearch(q: string) {
    setMedicineSearch(q);
    if (q.length < 2) { setMedicineResults([]); return; }
    setSearchingMedicine(true);
    try {
      const results = await fetchMedicines(q);
      setMedicineResults(results.map((m) => ({ _id: m._id, name: m.name, totalStock: m.totalStock })));
    } catch {
      setMedicineResults([]);
    } finally {
      setSearchingMedicine(false);
    }
  }

  function addProduct(med: { _id: string; name: string }) {
    if (products.some((p) => p.medicine === med._id)) return;
    setProducts((prev) => [...prev, { medicine: med._id, medicineName: med.name, quantity: 1 }]);
    setMedicineSearch("");
    setMedicineResults([]);
  }

  function updateProductQty(medicineId: string, qty: number) {
    setProducts((prev) => prev.map((p) => (p.medicine === medicineId ? { ...p, quantity: Math.max(1, qty) } : p)));
  }

  function removeProduct(medicineId: string) {
    setProducts((prev) => prev.filter((p) => p.medicine !== medicineId));
  }

  function handleCreate() {
    if (!fromLocation || !toLocation || products.length === 0) {
      setToast({ message: "Fill all required fields", type: "error" });
      return;
    }
    if (fromLocation === toLocation) {
      setToast({ message: "Source and destination must differ", type: "error" });
      return;
    }
    createMutation.mutate({
      fromLocation,
      toLocation,
      products: products.map((p) => ({ medicine: p.medicine, quantity: p.quantity })),
      notes: notes || undefined,
    });
  }

  function handleBatchFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setBatchFile(file);
    setBatchRows([]);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/);
      const rows: { productName: string; quantity: number; error?: string }[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(",");
        if (parts.length < 2) {
          rows.push({ productName: trimmed, quantity: 0, error: "Missing quantity" });
          continue;
        }

        const productName = parts[0].trim();
        const qty = parseInt(parts[1].trim(), 10);

        if (!productName) {
          rows.push({ productName: "", quantity: 0, error: "Empty product name" });
          continue;
        }
        if (isNaN(qty) || qty <= 0) {
          rows.push({ productName, quantity: 0, error: "Invalid quantity (must be a positive number)" });
          continue;
        }

        rows.push({ productName, quantity: qty });
      }

      setBatchRows(rows);
    };
    reader.readAsText(file);
  }

  function useBatchProducts() {
    const validRows = batchRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      setToast({ message: "No valid products to import", type: "error" });
      return;
    }
    // Pre-fill with valid rows; medicine IDs will be empty (user must still match medicines via search)
    setProducts(
      validRows.map((r) => ({
        medicine: "",
        medicineName: r.productName,
        quantity: r.quantity,
      }))
    );
    setShowBatchUpload(false);
    setBatchFile(null);
    setBatchRows([]);
    setShowCreate(true);
  }

  function getStatusNext(s: StockTransfer): "in_transit" | "completed" | "cancelled" | null {
    if (s.status === "pending") return "in_transit";
    if (s.status === "in_transit") return "completed";
    return null;
  }

  function getStatusLabel(s: StockTransfer): string {
    if (s.status === "pending") return "Mark In Transit";
    if (s.status === "in_transit") return "Mark Completed";
    return "";
  }

  const transfers = transfersData?.data ?? [];
  const pagination = transfersData?.pagination;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : TOTAL_PAGES_PLACEHOLDER;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-navy">Stock Transfer</h1>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<Upload size={16} />} onClick={() => setShowBatchUpload(true)}>
              Batch Upload
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => { resetCreateForm(); setShowCreate(true); }}>
              New Transfer
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search transfers..."
            />
          </div>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={8} />
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red mb-2">Failed to load stock transfers</p>
            <p className="text-xs text-gray-soft">{(error as Error)?.message || "Unknown error"}</p>
          </div>
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={<ArrowRight size={24} className="text-gray-soft" />}
            title="No stock transfers found"
            description="Create a new transfer to get started."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-line text-gray text-left">
                  <th className="px-4 py-3 font-medium" scope="col">Reference</th>
                  <th className="px-4 py-3 font-medium" scope="col">From</th>
                  <th className="px-4 py-3 font-medium" scope="col">To</th>
                  <th className="px-4 py-3 font-medium" scope="col">Products</th>
                  <th className="px-4 py-3 font-medium" scope="col">Qty</th>
                  <th className="px-4 py-3 font-medium" scope="col">Status</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell" scope="col">Requested By</th>
                  <th className="px-4 py-3 font-medium" scope="col">Date</th>
                  <th className="px-4 py-3 font-medium" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t: StockTransfer) => {
                  const totalQty = t.products.reduce((sum, p) => sum + p.quantity, 0);
                  const nextStatus = getStatusNext(t);
                  return (
                    <tr key={t._id} className="border-b border-paper last:border-0 hover:bg-paper transition">
                      <td className="px-4 py-3 font-mono text-xs text-navy">{t.referenceNumber}</td>
                      <td className="px-4 py-3 text-navy">{t.fromLocation}</td>
                      <td className="px-4 py-3 text-navy">{t.toLocation}</td>
                      <td className="px-4 py-3 text-navy">{t.products.length}</td>
                      <td className="px-4 py-3 text-navy tabular-nums">{totalQty}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[t.status] ?? "sand"}>{t.status.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray hidden md:table-cell">
                        {typeof t.requestedBy === "object" && t.requestedBy ? t.requestedBy.name : ""}
                      </td>
                      <td className="px-4 py-3 text-gray">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canManage && t.status === "pending" && (
                            <button
                              onClick={() => setDeleteConfirmId(t._id)}
                              className="p-1.5 rounded-control text-gray-soft hover:text-red hover:bg-red-bg transition"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          {canManage && nextStatus && (
                            <button
                              onClick={() =>
                                setConfirmAction({ id: t._id, status: nextStatus, label: getStatusLabel(t) })
                              }
                              className="p-1.5 rounded-control text-gray-soft hover:text-blue-700 hover:bg-blue-50 transition"
                              title={getStatusLabel(t)}
                            >
                              {nextStatus === "completed" ? <CheckCircle size={15} /> : <Truck size={15} />}
                            </button>
                          )}
                          {t.status === "cancelled" && (
                            <span className="p-1.5 rounded-control text-gray-soft">
                              <XCircle size={15} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line">
            <div className="text-xs text-gray-soft">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="w-8 h-8 rounded-control text-xs font-medium text-gray hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-soft">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-control text-xs font-medium transition ${
                        p === page ? "bg-orange-500 text-white" : "text-gray hover:bg-paper"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-8 h-8 rounded-control text-xs font-medium text-gray hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Batch Upload Modal */}
      <Modal open={showBatchUpload} onClose={() => setShowBatchUpload(false)} title="Batch Upload Products" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-navy">
            Upload a CSV or TXT file with columns: Product Name, Quantity. Each row should be: product name,quantity
          </p>

          <div className="bg-paper rounded-control p-3 text-xs text-gray font-mono">
            <div className="font-sans font-medium text-navy/80 mb-1">Sample format:</div>
            <div>Paracetamol,10</div>
            <div>Amoxicillin,25</div>
            <div>Ibuprofen,15</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray mb-1">Select File</label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleBatchFileChange}
              className="block w-full text-sm text-navy file:mr-4 file:py-2 file:px-4 file:rounded-control file:border-0 file:text-sm file:font-medium file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:cursor-pointer transition"
            />
          </div>

          {batchRows.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray">
                Preview ({batchRows.filter((r) => !r.error).length} valid, {batchRows.filter((r) => r.error).length} errors)
              </label>
              <div className="max-h-60 overflow-y-auto border border-line rounded-control">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-gray text-left">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Product Name</th>
                      <th className="px-3 py-2 font-medium">Quantity</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row, i) => (
                      <tr key={i} className={`border-b border-paper last:border-0 ${row.error ? "bg-red-bg" : ""}`}>
                        <td className="px-3 py-2 text-gray">{i + 1}</td>
                        <td className="px-3 py-2 text-navy">{row.productName || <span className="text-red-500">—</span>}</td>
                        <td className="px-3 py-2 text-navy">{row.error ? "—" : row.quantity}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <span className="text-xs text-red">{row.error}</span>
                          ) : (
                            <span className="text-xs text-blue-700">Valid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setShowBatchUpload(false); setBatchFile(null); setBatchRows([]); }}>
              Cancel
            </Button>
            <Button
              icon={<Plus size={16} />}
              onClick={useBatchProducts}
              disabled={batchRows.filter((r) => !r.error).length === 0}
            >
              Use These Products
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Stock Transfer" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="From Location"
              value={fromLocation}
              onChange={(e) => setFromLocation(e.target.value)}
              options={LOCATION_OPTIONS}
              placeholder="Select source"
            />
            <Select
              label="To Location"
              value={toLocation}
              onChange={(e) => setToLocation(e.target.value)}
              options={LOCATION_OPTIONS}
              placeholder="Select destination"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray">Products</label>
            <div className="relative">
              <SearchInput
                value={medicineSearch}
                onChange={(e) => handleMedicineSearch(e.target.value)}
                placeholder={searchingMedicine ? "Searching..." : "Search medicine to add..."}
              />
              {medicineResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-control shadow-lg max-h-48 overflow-y-auto">
                  {medicineResults.map((m) => (
                    <button
                      key={m._id}
                      onClick={() => addProduct(m)}
                      disabled={products.some((p) => p.medicine === m._id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-paper flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <span className="text-navy">{m.name}</span>
                      <span className="text-xs text-gray-soft">Stock: {m.totalStock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {products.length > 0 && (
              <div className="space-y-2 mt-2">
                {products.map((p) => (
                  <div key={p.medicine} className="flex items-center gap-2 bg-paper rounded-control px-3 py-2">
                    <span className="flex-1 text-sm text-navy truncate">{p.medicineName}</span>
                    <input
                      type="number"
                      min={1}
                      value={p.quantity}
                      onChange={(e) => updateProductQty(p.medicine, parseInt(e.target.value, 10) || 1)}
                      className="w-20 px-2 py-1 rounded border border-line text-sm text-center outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => removeProduct(p.medicine)}
                      className="p-1 rounded text-gray-soft hover:text-red hover:bg-red-bg transition"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add any notes..."
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              loading={createMutation.isPending}
              disabled={!fromLocation || !toLocation || products.length === 0}
            >
              Create Transfer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Status Update Confirmation */}
      <ConfirmDialog
        open={!!confirmAction}
        title="Update Transfer Status"
        message={`Are you sure you want to ${confirmAction?.label?.toLowerCase()} this transfer?`}
        confirmLabel={confirmAction?.label ?? "Confirm"}
        variant="primary"
        onConfirm={() => {
          if (confirmAction) statusMutation.mutate({ id: confirmAction.id, status: confirmAction.status });
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        title="Delete Transfer"
        message="Are you sure you want to delete this pending transfer? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

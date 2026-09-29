import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  PackageCheck,
  XCircle,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  listPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
  deletePurchaseOrder,
} from "../api/purchaseOrders";
import { fetchMedicines } from "../api/medicines";
import { PurchaseOrder, Medicine } from "../types";
import SearchInput from "../components/ui/SearchInput";
import Select from "../components/ui/Select";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import Toast from "../components/ui/Toast";
import { TableSkeleton } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "gray",
  sent: "blue",
  partially_received: "amber",
  received: "pine",
  cancelled: "red",
};

interface ProductLine {
  medicine: string;
  quantity: number;
  unitPrice: number;
}

interface OrderForm {
  supplier: string;
  products: ProductLine[];
  expectedDeliveryDate: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = {
  supplier: "",
  products: [{ medicine: "", quantity: 1, unitPrice: 0 }],
  expectedDeliveryDate: "",
  notes: "",
};

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchRows, setBatchRows] = useState<ProductLine[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", search, status, page],
    queryFn: () =>
      listPurchaseOrders({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: 20,
      }),
  });

  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [searchingMedicine, setSearchingMedicine] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!medicineSearch.trim()) {
      setMedicineResults([]);
      return;
    }
    let cancelled = false;
    setSearchingMedicine(true);
    fetchMedicines(medicineSearch)
      .then((results) => {
        if (!cancelled) setMedicineResults(results);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSearchingMedicine(false);
      });
    return () => {
      cancelled = true;
    };
  }, [medicineSearch]);

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMedicineSearch("");
    setMedicineResults([]);
    setActiveProductIndex(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((order: PurchaseOrder) => {
    setEditingId(order._id);
    setForm({
      supplier: order.supplier,
      products: order.products.map((p) => ({
        medicine: typeof p.medicine === "object" ? p.medicine._id : p.medicine,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
      })),
      expectedDeliveryDate: order.expectedDeliveryDate
        ? order.expectedDeliveryDate.split("T")[0]
        : "",
      notes: order.notes || "",
    });
    setMedicineSearch("");
    setMedicineResults([]);
    setActiveProductIndex(null);
    setModalOpen(true);
  }, []);

  const addProductLine = () => {
    setForm((f) => ({
      ...f,
      products: [...f.products, { medicine: "", quantity: 1, unitPrice: 0 }],
    }));
  };

  const removeProductLine = (idx: number) => {
    setForm((f) => ({
      ...f,
      products: f.products.filter((_, i) => i !== idx),
    }));
  };

  const updateProductLine = (idx: number, field: keyof ProductLine, value: string | number) => {
    setForm((f) => ({
      ...f,
      products: f.products.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }));
  };

  const selectMedicine = (idx: number, med: Medicine) => {
    updateProductLine(idx, "medicine", med._id);
    if (!form.products[idx].unitPrice) {
      updateProductLine(idx, "unitPrice", med.purchasePrice);
    }
    setMedicineSearch("");
    setMedicineResults([]);
    setActiveProductIndex(null);
  };

  const computedTotal = form.products.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

  async function handleSave() {
    if (!form.supplier.trim()) {
      setToast({ message: "Supplier name is required", type: "error" });
      return;
    }
    const validProducts = form.products.filter((p) => p.medicine && p.quantity > 0);
    if (validProducts.length === 0) {
      setToast({ message: "Add at least one product", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplier: form.supplier.trim(),
        products: validProducts,
        expectedDeliveryDate: form.expectedDeliveryDate || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        await updatePurchaseOrder(editingId, payload);
        setToast({ message: "Purchase order updated", type: "success" });
      } else {
        await createPurchaseOrder(payload);
        setToast({ message: "Purchase order created", type: "success" });
      }
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setModalOpen(false);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Failed to save";
      setToast({ message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await updatePurchaseOrderStatus(id, newStatus);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setToast({ message: `Order marked as ${newStatus.replace(/_/g, " ")}`, type: "success" });
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Failed to update status";
      setToast({ message, type: "error" });
    }
  }

  async function handleReceive() {
    if (!receivingId) return;
    setReceiving(true);
    try {
      await receivePurchaseOrder(receivingId);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setToast({ message: "Order received — stock updated", type: "success" });
      setReceiveModalOpen(false);
      setReceivingId(null);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Failed to receive order";
      setToast({ message, type: "error" });
    } finally {
      setReceiving(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await deletePurchaseOrder(deletingId);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setToast({ message: "Purchase order deleted", type: "success" });
      setDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Failed to delete";
      setToast({ message, type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  function parseBatchFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      const rows: ProductLine[] = [];
      const errors: string[] = [];
      const isCsv = file.name.endsWith(".csv");
      lines.forEach((line, i) => {
        const parts = isCsv ? line.split(",").map((p) => p.trim()) : line.split(",").map((p) => p.trim());
        if (parts.length < 2 || parts.length > 3) {
          errors.push(`Row ${i + 1}: expected 2-3 columns, got ${parts.length}`);
          return;
        }
        const productName = parts[0];
        const qty = parseInt(parts[1], 10);
        if (!productName || isNaN(qty) || qty <= 0) {
          errors.push(`Row ${i + 1}: invalid product name or quantity`);
          return;
        }
        const unitPrice = parts[2] ? parseFloat(parts[2]) || 0 : 0;
        rows.push({ medicine: "", quantity: qty, unitPrice });
      });
      if (errors.length > 0) {
        setToast({ message: `Parse errors:\n${errors.join("\n")}`, type: "error" });
      }
      setBatchRows(rows);
    };
    reader.readAsText(file);
  }

  function handleBatchFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchFile(file);
    parseBatchFile(file);
  }

  function applyBatchRows() {
    setForm((f) => ({
      ...f,
      products: batchRows.length > 0
        ? batchRows
        : [{ medicine: "", quantity: 1, unitPrice: 0 }],
    }));
    setShowBatchUpload(false);
    setBatchFile(null);
    setBatchRows([]);
    setModalOpen(true);
  }

  const orders = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  function getMedicineName(p: PurchaseOrder["products"][0]) {
    if (typeof p.medicine === "object") return p.medicine.name;
    return "Unknown";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-900">Purchase Orders</h1>
        <div className="flex gap-2">
          <Button onClick={openCreateModal} icon={<Plus size={15} />}>
            New Order
          </Button>
          <Button onClick={() => setShowBatchUpload(true)} icon={<Upload size={15} />}>
            Batch Upload
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-sand-200 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by reference or supplier..."
            />
          </div>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-sand-200 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={8} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} className="text-ink-900/30" />}
            title="No purchase orders found"
            description="Create a purchase order to get started."
            action={
              <Button onClick={openCreateModal} icon={<Plus size={15} />}>
                New Order
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-sand-200 text-ink-900/50 text-left">
                  <th className="px-4 py-3 font-medium" scope="col">Reference</th>
                  <th className="px-4 py-3 font-medium" scope="col">Supplier</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell" scope="col">Items</th>
                  <th className="px-4 py-3 font-medium text-right" scope="col">Total</th>
                  <th className="px-4 py-3 font-medium" scope="col">Status</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell" scope="col">Ordered By</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell" scope="col">Expected</th>
                  <th className="px-4 py-3 font-medium" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: PurchaseOrder) => (
                  <tr key={o._id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50 transition">
                    <td className="px-4 py-3 font-medium text-ink-900">{o.referenceNumber}</td>
                    <td className="px-4 py-3 text-ink-900/70">{o.supplier}</td>
                    <td className="px-4 py-3 text-ink-900/60 hidden sm:table-cell">{o.products.length}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-900 tabular-nums">{ghs(o.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[o.status] ?? "sand"}>{o.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-900/60 hidden md:table-cell">
                      {typeof o.orderedBy === "object" ? o.orderedBy.name : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-900/60 hidden lg:table-cell">
                      {o.expectedDeliveryDate
                        ? new Date(o.expectedDeliveryDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {o.status === "draft" && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEditModal(o)}
                              icon={<Pencil size={13} />}
                              title="Edit"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleStatusChange(o._id, "sent")}
                              icon={<Send size={13} />}
                              title="Send"
                            />
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => { setDeletingId(o._id); setDeleteModalOpen(true); }}
                              icon={<Trash2 size={13} />}
                              title="Delete"
                            />
                          </>
                        )}
                        {(o.status === "sent" || o.status === "partially_received") && (
                          <Button
                            size="sm"
                            onClick={() => { setReceivingId(o._id); setReceiveModalOpen(true); }}
                            icon={<PackageCheck size={13} />}
                            title="Receive"
                          />
                        )}
                        {o.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(o._id, "cancelled")}
                            icon={<XCircle size={13} />}
                            title="Cancel"
                            className="text-red-600 hover:bg-red-50"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between text-sm text-ink-900/50">
          <span>
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              icon={<ChevronLeft size={14} />}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Purchase Order" : "New Purchase Order"}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Supplier Name"
            value={form.supplier}
            onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            placeholder="Enter supplier name"
          />

          <div>
            <label className="block text-xs font-medium text-ink-900/60 mb-1">Products</label>
            <div className="space-y-2">
              {form.products.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={
                        line.medicine
                          ? medicineResults.find((m) => m._id === line.medicine)?.name ??
                            (activeProductIndex === idx ? medicineSearch : "Selected")
                          : medicineSearch
                      }
                      onFocus={() => {
                        setActiveProductIndex(idx);
                        if (line.medicine) {
                          const med = medicineResults.find((m) => m._id === line.medicine);
                          if (med) setMedicineSearch(med.name);
                        }
                      }}
                      onChange={(e) => {
                        setMedicineSearch(e.target.value);
                        setActiveProductIndex(idx);
                        if (line.medicine) {
                          updateProductLine(idx, "medicine", "");
                        }
                      }}
                      placeholder="Search medicine..."
                      className="w-full px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
                    />
                    {activeProductIndex === idx && medicineResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 bg-white border border-sand-200 rounded-lg mt-1 max-h-40 overflow-y-auto shadow-lg">
                        {medicineResults.map((med) => (
                          <button
                            key={med._id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-sand-50 transition"
                            onClick={() => selectMedicine(idx, med)}
                          >
                            {med.name}
                            {med.sku && <span className="text-ink-900/40 ml-2">({med.sku})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => updateProductLine(idx, "quantity", parseInt(e.target.value, 10) || 0)}
                    min={1}
                    placeholder="Qty"
                    className="w-20 px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
                  />
                  <input
                    type="number"
                    value={line.unitPrice}
                    onChange={(e) => updateProductLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                    min={0}
                    step="0.01"
                    placeholder="Price"
                    className="w-24 px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
                  />
                  {form.products.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeProductLine(idx)}
                      icon={<XCircle size={14} />}
                      className="text-red-500"
                    />
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={addProductLine} className="mt-2" icon={<Plus size={13} />}>
              Add product
            </Button>
          </div>

          <div className="text-right text-sm font-medium text-ink-900">
            Total: {ghs(computedTotal)}
          </div>

          <Input
            label="Expected Delivery Date"
            type="date"
            value={form.expectedDeliveryDate}
            onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))}
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink-900/60">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingId ? "Update Order" : "Create Order"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Receive Confirmation Modal */}
      <Modal
        open={receiveModalOpen}
        onClose={() => { setReceiveModalOpen(false); setReceivingId(null); }}
        title="Receive Purchase Order"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-900/70">
            This will mark the order as received and update medicine stock. Continue?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setReceiveModalOpen(false); setReceivingId(null); }}
            >
              Cancel
            </Button>
            <Button onClick={handleReceive} loading={receiving}>
              Confirm Receive
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeletingId(null); }}
        title="Delete Purchase Order"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-900/70">
            Are you sure you want to delete this draft purchase order? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setDeleteModalOpen(false); setDeletingId(null); }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Upload Modal */}
      <Modal
        open={showBatchUpload}
        onClose={() => { setShowBatchUpload(false); setBatchFile(null); setBatchRows([]); }}
        title="Batch Upload Products"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-900/70">
            Upload a CSV or TXT file with columns: Product Name, Quantity, Unit Price.
            Each row should be: <code className="bg-sand-100 px-1 rounded">product name,quantity,unit price</code>
          </p>
          <div className="bg-sand-50 border border-sand-200 rounded-lg p-3 text-xs text-ink-900/60 font-mono">
            <div>Aspirin,50,12.50</div>
            <div>Paracetamol,100,8.00</div>
            <div>Ibuprofen,200</div>
          </div>
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleBatchFileChange}
            className="block w-full text-sm text-ink-900/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pine-500 file:text-white hover:file:bg-pine-600 transition"
          />
          {batchFile && (
            <p className="text-xs text-ink-900/50">
              Selected: {batchFile.name} ({batchRows.length} rows parsed)
            </p>
          )}
          {batchRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-ink-900/50 text-left">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Product Name</th>
                    <th className="px-3 py-2 font-medium text-right">Quantity</th>
                    <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, i) => (
                    <tr key={i} className="border-b border-sand-100 last:border-0">
                      <td className="px-3 py-2 text-ink-900/40">{i + 1}</td>
                      <td className="px-3 py-2 text-ink-900">{row.medicine || "(search later)"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{ghs(row.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowBatchUpload(false); setBatchFile(null); setBatchRows([]); }}>
              Cancel
            </Button>
            <Button onClick={applyBatchRows} disabled={batchRows.length === 0} icon={<Plus size={15} />}>
              Use These Products
            </Button>
          </div>
        </div>
      </Modal>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

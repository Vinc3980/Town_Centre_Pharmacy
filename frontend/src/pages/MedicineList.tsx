import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Ban,
  ArrowDownToLine,
  Eye,
  Image as ImageIcon,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  fetchMedicines,
  fetchCategories,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  discontinueMedicine,
  receiveStock,
  uploadMedicineImage,
  removeMedicineImage,
  Category,
} from "../api/medicines";
import { Medicine } from "../types";
import { useAuth } from "../context/AuthContext";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import PageTabs from "../components/ui/PageTabs";

const FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "cream",
  "ointment",
  "drops",
  "inhaler",
  "suspension",
  "suppository",
  "patch",
  "gel",
  "spray",
  "solution",
  "powder",
];

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  genericName: "",
  brand: "",
  category: "",
  manufacturer: "",
  dosage: "",
  strength: "",
  form: "",
  barcode: "",
  sku: "",
  prescriptionRequired: false,
  isControlledSubstance: false,
  controlledSubstanceClass: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  minStock: 10,
  maxStock: 500,
  reorderLevel: 20,
  quantity: "",
  expiryDate: "",
};

const EMPTY_STOCK: Record<string, unknown> = {
  batchNumber: "",
  quantity: "",
  purchasePrice: "",
  sellingPrice: "",
  expiryDate: "",
  manufacturingDate: "",
  supplier: "",
};

const TABS = [
  { label: "All medicines", value: "all" },
  { label: "Low stock", value: "low_stock" },
  { label: "Expiring soon", value: "expiring" },
  { label: "Expired", value: "expired" },
];

const PAGE_SIZE = 10;

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCategoryName(category: Medicine["category"]): string {
  if (!category) return "—";
  if (typeof category === "string") return category;
  return category.name || "—";
}

function getCategoryId(category: Medicine["category"]): string {
  if (!category) return "";
  if (typeof category === "string") return category;
  return category._id || "";
}

function isExpiringSoon(med: Medicine): boolean {
  if (!med.nearestExpiry) return false;
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const exp = new Date(med.nearestExpiry);
  return exp > now && exp <= thirtyDays;
}

function isExpired(med: Medicine): boolean {
  if (!med.nearestExpiry) return false;
  return new Date(med.nearestExpiry) <= new Date();
}

function isLowStock(med: Medicine): boolean {
  return med.totalStock > 0 && med.totalStock <= (med.reorderLevel || 20);
}

function getStatusBadge(med: Medicine) {
  if (med.totalStock === 0) return <Badge variant="danger">Out of stock</Badge>;
  if (isExpired(med)) return <Badge variant="danger">Expired</Badge>;
  if (isExpiringSoon(med)) return <Badge variant="warning">Expiring</Badge>;
  if (isLowStock(med)) return <Badge variant="warning">Low stock</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

export default function MedicineList() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  useEffect(() => {
    const s = searchParams.get("search");
    if (s) setSearch(s);
  }, [searchParams]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tabFilter, setTabFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockMedicine, setStockMedicine] = useState<Medicine | null>(null);
  const [stockData, setStockData] = useState<Record<string, unknown>>({ ...EMPTY_STOCK });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" as "success" | "error" | "info" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = hasPermission("manage_medicines");

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => fetchMedicines(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const filtered = useMemo(() => {
    let list = medicines;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName?.toLowerCase().includes(q) ||
          m.brand?.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) {
      list = list.filter((m) => {
        const catId = getCategoryId(m.category);
        return catId === categoryFilter;
      });
    }
    if (tabFilter === "low_stock") {
      list = list.filter(isLowStock);
    } else if (tabFilter === "expiring") {
      list = list.filter(isExpiringSoon);
    } else if (tabFilter === "expired") {
      list = list.filter(isExpired);
    }
    return list;
  }, [medicines, search, categoryFilter, tabFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createMedicine(payload),
    onSuccess: async (newMedicine) => {
      if (imageFile) {
        try {
          await uploadMedicineImage(newMedicine._id, imageFile);
        } catch {
          // image upload failed but medicine created
        }
      }
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setFormOpen(false);
      resetForm();
      setToast({ message: "Product created successfully", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to create product", type: "error" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateMedicine(id, payload),
    onSuccess: async (updatedMedicine) => {
      if (imageFile) {
        try {
          await uploadMedicineImage(updatedMedicine._id, imageFile);
        } catch {
          // image upload failed but medicine updated
        }
      }
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setFormOpen(false);
      resetForm();
      setToast({ message: "Product updated successfully", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to update product", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMedicine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setToast({ message: "Product deleted successfully", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to delete product", type: "error" });
    },
  });

  const discontinueMutation = useMutation({
    mutationFn: (id: string) => discontinueMedicine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setToast({ message: "Product discontinued", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to discontinue product", type: "error" });
    },
  });

  const stockMutation = useMutation({
    mutationFn: (payload: {
      medicine: string;
      batchNumber: string;
      quantity: number;
      purchasePrice: number;
      sellingPrice: number;
      expiryDate: string;
      manufacturingDate?: string;
      supplier?: string;
    }) => receiveStock(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setStockModalOpen(false);
      setStockMedicine(null);
      setStockData({ ...EMPTY_STOCK });
      setToast({ message: "Stock received successfully", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to receive stock", type: "error" });
    },
  });

  const removeImageMutation = useMutation({
    mutationFn: (medicineId: string) => removeMedicineImage(medicineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      setToast({ message: "Image removed", type: "success" });
    },
    onError: (err: Error) => {
      setToast({ message: err.message || "Failed to remove image", type: "error" });
    },
  });

  function resetForm() {
    setFormData({ ...EMPTY_FORM });
    setImageFile(null);
    setImagePreview(null);
    setEditingMedicine(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(med: Medicine) {
    setEditingMedicine(med);
    setFormData({
      name: med.name,
      genericName: med.genericName || "",
      brand: med.brand || "",
      category: getCategoryId(med.category),
      manufacturer: med.manufacturer || "",
      dosage: med.dosage || "",
      strength: med.strength || "",
      form: med.form || "",
      barcode: med.barcode || "",
      sku: med.sku,
      prescriptionRequired: med.prescriptionRequired,
      isControlledSubstance: med.isControlledSubstance ?? false,
      controlledSubstanceClass: med.controlledSubstanceClass || "",
      description: med.description || "",
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      minStock: med.minStock,
      maxStock: med.maxStock,
      reorderLevel: med.reorderLevel,
    });
    setImageFile(null);
    setImagePreview(med.imageUrl || null);
    setFormOpen(true);
  }

  function openStock(med: Medicine) {
    setStockMedicine(med);
    setStockData({
      batchNumber: "",
      quantity: "",
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      expiryDate: "",
      manufacturingDate: "",
      supplier: "",
    });
    setStockModalOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (editingMedicine) {
      removeImageMutation.mutate(editingMedicine._id);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    const name = String(formData.name || "").trim();
    const sku = String(formData.sku || "").trim();
    if (!name) {
      setToast({ message: "Name is required", type: "error" });
      return;
    }
    if (!sku) {
      setToast({ message: "SKU is required", type: "error" });
      return;
    }
    payload.name = name;
    payload.sku = sku;
    payload.genericName = String(formData.genericName || "").trim() || undefined;
    payload.brand = String(formData.brand || "").trim() || undefined;
    payload.category = String(formData.category || "").trim() || undefined;
    payload.manufacturer = String(formData.manufacturer || "").trim() || undefined;
    payload.dosage = String(formData.dosage || "").trim() || undefined;
    payload.strength = String(formData.strength || "").trim() || undefined;
    payload.form = String(formData.form || "").trim() || undefined;
    payload.barcode = String(formData.barcode || "").trim() || undefined;
    payload.prescriptionRequired = Boolean(formData.prescriptionRequired);
    payload.isControlledSubstance = Boolean(formData.isControlledSubstance);
    payload.controlledSubstanceClass = formData.isControlledSubstance
      ? String(formData.controlledSubstanceClass || "").trim() || null
      : null;
    payload.description = String(formData.description || "").trim() || undefined;
    const pp = Number(formData.purchasePrice);
    const sp = Number(formData.sellingPrice);
    if (!pp && pp !== 0) {
      setToast({ message: "Purchase price is required", type: "error" });
      return;
    }
    if (!sp && sp !== 0) {
      setToast({ message: "Selling price is required", type: "error" });
      return;
    }
    payload.purchasePrice = pp;
    payload.sellingPrice = sp;
    payload.minStock = Number(formData.minStock) || 10;
    payload.maxStock = Number(formData.maxStock) || 500;
    payload.reorderLevel = Number(formData.reorderLevel) || 20;

    if (!editingMedicine) {
      const qty = Number(formData.quantity) || 0;
      if (qty > 0) {
        const exp = String(formData.expiryDate || "").trim();
        if (!exp) {
          setToast({ message: "Expiry date is required when an initial quantity is provided", type: "error" });
          return;
        }
        payload.quantity = Math.floor(qty);
        payload.expiryDate = exp;
      }
    }

    if (editingMedicine) {
      updateMutation.mutate({ id: editingMedicine._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleStockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stockMedicine) return;
    const batchNumber = String(stockData.batchNumber || "").trim();
    const quantity = Number(stockData.quantity);
    const purchasePrice = Number(stockData.purchasePrice);
    const sellingPrice = Number(stockData.sellingPrice);
    const expiryDate = String(stockData.expiryDate || "").trim();

    if (!batchNumber) {
      setToast({ message: "Batch number is required", type: "error" });
      return;
    }
    if (!quantity || quantity <= 0) {
      setToast({ message: "Quantity must be greater than 0", type: "error" });
      return;
    }
    if (!expiryDate) {
      setToast({ message: "Expiry date is required", type: "error" });
      return;
    }

    stockMutation.mutate({
      medicine: stockMedicine._id,
      batchNumber,
      quantity,
      purchasePrice,
      sellingPrice,
      expiryDate,
      manufacturingDate: String(stockData.manufacturingDate || "").trim() || undefined,
      supplier: String(stockData.supplier || "").trim() || undefined,
    });
  }

  const setFormField = useCallback(
    (key: string, value: unknown) => setFormData((prev) => ({ ...prev, [key]: value })),
    []
  );

  const setStockField = useCallback(
    (key: string, value: unknown) => setStockData((prev) => ({ ...prev, [key]: value })),
    []
  );

  return (
    <div className="space-y-0">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "success" })} />

      {/* PageTabs */}
      <PageTabs tabs={TABS} activeTab={tabFilter} onChange={(v) => { setTabFilter(v); setPage(1); }} />

      <div className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-navy">Products</h1>
            <p className="text-sm text-gray">{filtered.length} product{filtered.length !== 1 ? "s" : ""} found</p>
          </div>
          {canManage && (
            <Button icon={<Plus size={16} />} onClick={openCreate}>
              Add product
            </Button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 p-3 bg-white rounded-card border border-line">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((cat: Category) => (
              <option key={cat._id} value={cat._id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-card border border-line overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-blue-600" />
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-soft">
              <ImageIcon size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs mt-1">Try adjusting your filters or add a new product</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Product</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Category</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Form</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Price</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Stock</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paginated.map((med) => (
                      <tr key={med._id} className="hover:bg-paper transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {med.imageUrl ? (
                              <img src={med.imageUrl} alt={med.name} className="w-9 h-9 rounded-control object-cover border border-line" />
                            ) : (
                              <div className="w-9 h-9 rounded-control bg-paper flex items-center justify-center">
                                <ImageIcon size={14} className="text-gray-soft" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-navy">{med.name}</div>
                              {med.genericName && <div className="text-xs text-gray">{med.genericName}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray">{getCategoryName(med.category)}</td>
                        <td className="px-4 py-3 text-gray capitalize">{med.form || "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-gray">{ghs(med.sellingPrice)}</td>
                        <td className="px-4 py-3 tabular-nums text-navy font-medium">{med.totalStock}</td>
                        <td className="px-4 py-3">{getStatusBadge(med)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {med.imageUrl && (
                              <button onClick={() => { setViewerUrl(med.imageUrl!); setViewerOpen(true); }} className="p-1.5 rounded-control text-gray-soft hover:text-navy hover:bg-paper transition" title="View image">
                                <Eye size={15} />
                              </button>
                            )}
                            {canManage && (
                              <>
                                <button onClick={() => openEdit(med)} className="p-1.5 rounded-control text-gray-soft hover:text-blue-600 hover:bg-blue-50 transition" title="Edit">
                                  <Pencil size={15} />
                                </button>
                                <button onClick={() => openStock(med)} className="p-1.5 rounded-control text-gray-soft hover:text-blue-600 hover:bg-blue-50 transition" title="Receive stock">
                                  <ArrowDownToLine size={15} />
                                </button>
                                {med.status === "active" && (
                                  <button onClick={() => { if (confirm(`Discontinue "${med.name}"?`)) discontinueMutation.mutate(med._id); }} className="p-1.5 rounded-control text-gray-soft hover:text-amber hover:bg-amber-bg transition" title="Discontinue">
                                    <Ban size={15} />
                                  </button>
                                )}
                                <button onClick={() => { if (confirm(`Delete "${med.name}"? This action cannot be undone.`)) deleteMutation.mutate(med._id); }} className="p-1.5 rounded-control text-gray-soft hover:text-red hover:bg-red-bg transition" title="Delete">
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-line">
                  <span className="text-xs text-gray">Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-control text-gray-soft hover:text-navy hover:bg-paper transition disabled:opacity-30">
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-pill text-xs font-semibold transition ${p === page ? "bg-blue-600 text-white" : "text-gray hover:bg-paper"}`}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-control text-gray-soft hover:text-navy hover:bg-paper transition disabled:opacity-30">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Medicine Form Modal */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        title={editingMedicine ? "Edit Product" : "Add Product"}
        size="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray mb-1">
                  Name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={String(formData.name || "")}
                  onChange={(e) => setFormField("name", e.target.value)}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
            </div>
            {/* SKU */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">
                SKU <span className="text-red">*</span>
              </label>
              <input
                type="text"
                required
                value={String(formData.sku || "")}
                onChange={(e) => setFormField("sku", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Generic Name */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Generic Name</label>
              <input
                type="text"
                value={String(formData.genericName || "")}
                onChange={(e) => setFormField("genericName", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Brand</label>
              <input
                type="text"
                value={String(formData.brand || "")}
                onChange={(e) => setFormField("brand", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Category */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Category</label>
              <select
                value={String(formData.category || "")}
                onChange={(e) => setFormField("category", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
              >
                <option value="">Select category</option>
                {categories.map((cat: Category) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Manufacturer */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Manufacturer</label>
              <input
                type="text"
                value={String(formData.manufacturer || "")}
                onChange={(e) => setFormField("manufacturer", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Dosage */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Dosage</label>
              <input
                type="text"
                value={String(formData.dosage || "")}
                onChange={(e) => setFormField("dosage", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Strength */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Strength</label>
              <input
                type="text"
                value={String(formData.strength || "")}
                onChange={(e) => setFormField("strength", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Form */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Form</label>
              <select
                value={String(formData.form || "")}
                onChange={(e) => setFormField("form", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
              >
                <option value="">Select form</option>
                {FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {/* Barcode */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray mb-1">Barcode</label>
              <input
                type="text"
                value={String(formData.barcode || "")}
                onChange={(e) => setFormField("barcode", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            {/* Description */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray mb-1">Description</label>
              <textarea
                rows={2}
                value={String(formData.description || "")}
                onChange={(e) => setFormField("description", e.target.value)}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition resize-none"
              />
            </div>
            {/* Prescription Required */}
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formData.prescriptionRequired)}
                  onChange={(e) => setFormField("prescriptionRequired", e.target.checked)}
                  className="w-4 h-4 rounded border-line text-blue-600 focus:ring-blue-500/30"
                />
                <span className="text-sm text-gray">Prescription Required</span>
              </label>
            </div>
            {/* Controlled Substance */}
            <div className="col-span-2 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isControlledSubstance)}
                  onChange={(e) => setFormField("isControlledSubstance", e.target.checked)}
                  className="w-4 h-4 rounded border-line text-blue-600 focus:ring-blue-500/30"
                />
                <span className="text-sm text-gray">Controlled Substance</span>
              </label>
              {Boolean(formData.isControlledSubstance) && (
                <div>
                  <label className="block text-xs font-medium text-gray mb-1">Controlled substance class</label>
                  <input
                    type="text"
                    value={String(formData.controlledSubstanceClass || "")}
                    onChange={(e) => setFormField("controlledSubstanceClass", e.target.value)}
                    placeholder="e.g. Narcotic, Psychotropic"
                    className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t border-line pt-4">
            <h4 className="text-xs font-medium text-gray mb-3 uppercase tracking-wide">Pricing</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray mb-1">
                  Purchase Price <span className="text-red">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.purchasePrice as number | string}
                  onChange={(e) => setFormField("purchasePrice", e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray mb-1">
                  Selling Price <span className="text-red">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.sellingPrice as number | string}
                  onChange={(e) => setFormField("sellingPrice", e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
            </div>
          </div>

          {/* Stock Levels */}
          <div className="border-t border-line pt-4">
            <h4 className="text-xs font-medium text-gray mb-3 uppercase tracking-wide">Stock Levels</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray mb-1">Min Stock</label>
                <input
                  type="number"
                  min="0"
                  value={formData.minStock as number}
                  onChange={(e) => setFormField("minStock", Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray mb-1">Max Stock</label>
                <input
                  type="number"
                  min="0"
                  value={formData.maxStock as number}
                  onChange={(e) => setFormField("maxStock", Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray mb-1">Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  value={formData.reorderLevel as number}
                  onChange={(e) => setFormField("reorderLevel", Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
            </div>
            {!editingMedicine && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-gray mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={String(formData.quantity ?? "")}
                    onChange={(e) => setFormField("quantity", e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 100"
                    className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray mb-1">
                    Expiry Date
                    {Number(formData.quantity) > 0 && <span className="text-red"> *</span>}
                  </label>
                  <input
                    type="date"
                    value={String(formData.expiryDate ?? "")}
                    onChange={(e) => setFormField("expiryDate", e.target.value)}
                    className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Image Upload */}
          <div className="border-t border-line pt-4">
            <h4 className="text-xs font-medium text-gray mb-3 uppercase tracking-wide">Image</h4>
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-20 h-20 rounded-control object-cover border border-line"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-xs text-red hover:text-red font-medium"
                >
                  Remove image
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-control border border-dashed border-line text-sm text-gray hover:border-blue-500 hover:text-blue-600 transition"
                >
                  Choose image
                </button>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingMedicine ? "Save changes" : "Create product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receive Stock Modal */}
      <Modal
        open={stockModalOpen}
        onClose={() => {
          setStockModalOpen(false);
          setStockMedicine(null);
          setStockData({ ...EMPTY_STOCK });
        }}
        title={`Receive Stock — ${stockMedicine?.name ?? ""}`}
        size="md"
      >
        <form onSubmit={handleStockSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray mb-1">
              Batch Number <span className="text-red">*</span>
            </label>
            <input
              type="text"
              required
              value={String(stockData.batchNumber || "")}
              onChange={(e) => setStockField("batchNumber", e.target.value)}
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray mb-1">
              Quantity <span className="text-red">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              value={stockData.quantity as number | string}
              onChange={(e) => setStockField("quantity", e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray mb-1">Purchase Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stockData.purchasePrice as number | string}
                onChange={(e) => setStockField("purchasePrice", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray mb-1">Selling Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stockData.sellingPrice as number | string}
                onChange={(e) => setStockField("sellingPrice", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray mb-1">
              Expiry Date <span className="text-red">*</span>
            </label>
            <input
              type="date"
              required
              value={String(stockData.expiryDate || "")}
              onChange={(e) => setStockField("expiryDate", e.target.value)}
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray mb-1">Manufacturing Date</label>
            <input
              type="date"
              value={String(stockData.manufacturingDate || "")}
              onChange={(e) => setStockField("manufacturingDate", e.target.value)}
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray mb-1">Supplier</label>
            <input
              type="text"
              value={String(stockData.supplier || "")}
              onChange={(e) => setStockField("supplier", e.target.value)}
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStockModalOpen(false);
                setStockMedicine(null);
                setStockData({ ...EMPTY_STOCK });
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={stockMutation.isPending}>
              Receive Stock
            </Button>
          </div>
        </form>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setViewerUrl("");
        }}
        title="Product Image"
        size="lg"
      >
        <div className="flex items-center justify-center">
          {viewerUrl && (
            <img src={viewerUrl} alt="Product" className="max-w-full max-h-[60vh] rounded-lg object-contain" />
          )}
        </div>
      </Modal>
    </div>
  );
}

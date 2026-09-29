import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Banknote, Smartphone, CreditCard,
  Pause, X, UserPlus, Tag, Receipt, Barcode, Loader2, Clock, AlertTriangle, Keyboard, Eye,
  HandCoins, ChevronDown, Package, Flame, Shield, Bug, Sun, Thermometer,
  BriefcaseMedical, HeartPulse, ShieldCheck, User,
} from "lucide-react";
import { fetchMedicines } from "../api/medicines";
import {
  createSale, holdSale, resumeSale, fetchHeldSales, deleteHeldSale, getSaleReceipt, lookupBarcode,
} from "../api/sales";
import { CartLine, HeldSale, Medicine, SalePayment, SaleReceipt } from "../types";
import { useAuth } from "../context/AuthContext";
import { getCustomer } from "../api/customers";
import { getSocket } from "../lib/socket";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import NumericKeypad from "../components/NumericKeypad";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genPaymentRef(method: SalePayment["method"]): string | undefined {
  if (method === "cash") return undefined;
  const prefixes: Partial<Record<SalePayment["method"], string>> = {
    mobile_money: "MMO",
    card: "CARD",
    bank_transfer: "BTR",
    credit: "CRD",
    other: "REF",
    insurance: "INS",
  };
  const prefix = prefixes[method];
  if (!prefix) return undefined;
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${dateStr}-${seq}`;
}

const AMOUNT_INPUT_CLASS =
  "w-24 px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 tabular-nums transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const PAY_METHODS: { key: SalePayment["method"]; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "bank_transfer", label: "Bank Transfer", icon: CreditCard },
  { key: "credit", label: "Credit", icon: HandCoins },
  { key: "other", label: "Other", icon: CreditCard },
  { key: "insurance", label: "Insurance", icon: ShieldCheck },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "analgesics": Flame,
  "antibiotics": Shield,
  "antimalarials": Bug,
  "vitamins": Sun,
  "cold & flu": Thermometer,
  "cold and flu": Thermometer,
  "first aid": BriefcaseMedical,
  "chronic disease": HeartPulse,
};

function getCategoryLabel(category: Medicine["category"]): string {
  if (!category) return "";
  if (typeof category === "string") return category;
  return category.name ?? "";
}

function ProductThumb({ medicine, size }: { medicine: Medicine; size: number }) {
  if (medicine.imageUrl) {
    return <img src={medicine.imageUrl} alt={medicine.name} className="w-full h-full object-cover" />;
  }
  const Icon = CATEGORY_ICONS[getCategoryLabel(medicine.category).toLowerCase().trim()] ?? Package;
  return <Icon size={size} className="text-blue-500" />;
}

const CATEGORY_PALETTE = [
  { idle: "bg-blue-50/60 border-blue-100 text-navy", countIdle: "bg-blue-100 text-blue-700", active: "bg-blue-600 border-blue-600 text-white", countActive: "bg-white/20 text-white" },
  { idle: "bg-green/10 border-green/30 text-navy", countIdle: "bg-green/15 text-green", active: "bg-green border-green text-white", countActive: "bg-white/20 text-white" },
  { idle: "bg-amber-bg border-amber/30 text-navy", countIdle: "bg-amber/20 text-amber", active: "bg-amber border-amber text-white", countActive: "bg-white/25 text-white" },
  { idle: "bg-orange-1/25 border-orange-1/50 text-navy", countIdle: "bg-orange-1/40 text-orange-2", active: "bg-orange-2 border-orange-2 text-white", countActive: "bg-white/20 text-white" },
  { idle: "bg-red-bg border-red/25 text-navy", countIdle: "bg-red/15 text-red", active: "bg-red border-red text-white", countActive: "bg-white/20 text-white" },
  { idle: "bg-navy/10 border-navy/20 text-navy", countIdle: "bg-navy/15 text-navy", active: "bg-navy border-navy text-white", countActive: "bg-white/15 text-white" },
];

export default function POS() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDiscount = user?.permissions?.includes("apply_discounts") ?? false;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string | undefined>();
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showReceipt, setShowReceipt] = useState<SaleReceipt | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCreditCustomer, setShowCreditCustomer] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePayment["method"] | null>(null);
  const [saleType, setSaleType] = useState<"retail" | "insurance">("retail");
  const [insuranceChoice, setInsuranceChoice] = useState<"NHIS" | "other">("NHIS");
  const [insuranceOther, setInsuranceOther] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxReference, setRxReference] = useState("");
  const [rxError, setRxError] = useState("");
  const [pendingResume, setPendingResume] = useState<{ held: HeldSale; payments: SalePayment[]; amountReceived?: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string; medicine: Medicine } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<Medicine | null>(null);
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  const { data: medicines, isLoading: medicinesLoading } = useQuery({
    queryKey: ["medicines", debouncedSearch],
    queryFn: () => fetchMedicines(debouncedSearch),
    placeholderData: (prev) => prev,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers", customerSearch],
    queryFn: async () => {
      const { data } = await (await import("../lib/apiClient")).api.get(
        `/customers${customerSearch ? `?search=${encodeURIComponent(customerSearch)}` : ""}`
      );
      return data as { _id: string; name: string; phone: string }[];
    },
    enabled: showCustomerSearch,
  });

  const { data: selectedCustomerDetail } = useQuery({
    queryKey: ["customer-detail", selectedCustomer],
    queryFn: () => getCustomer(selectedCustomer!),
    enabled: Boolean(selectedCustomer),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await (await import("../lib/apiClient")).api.get("/categories");
      return data as { _id: string; name: string }[];
    },
  });

  const { data: currentSession, refetch: refetchSession } = useQuery({
    queryKey: ["daily-session-current"],
    queryFn: async () => {
      const { data } = await (await import("../lib/apiClient")).api.get("/daily/sessions/current");
      return data as { _id: string; status: string } | null;
    },
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    function onSessionUpdate() { refetchSession(); }
    socket.on("daily.session.opened", onSessionUpdate);
    socket.on("daily.session.closed", onSessionUpdate);
    return () => {
      socket.off("daily.session.opened", onSessionUpdate);
      socket.off("daily.session.closed", onSessionUpdate);
    };
  }, [refetchSession]);

  const hasOpenSession = currentSession?.status === "open";

  const loadHeld = useCallback(async () => {
    try {
      const sales = await fetchHeldSales();
      setHeldSales(sales);
      setShowHeld(true);
    } catch {
      showToast("Failed to load held sales", "error");
    }
  }, [showToast]);

  async function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = barcodeInput.trim();
    if (!code) return;
    try {
      const med = await lookupBarcode(code);
      if (med.totalStock <= 0) {
        showToast(`${med.name} is out of stock`, "error");
        return;
      }
      addToCart(med);
      setBarcodeInput("");
    } catch {
      showToast("No product found with that barcode", "error");
    }
  }

  function addToCart(m: { _id: string; name: string; sellingPrice: number; totalStock: number; prescriptionRequired?: boolean; isControlledSubstance?: boolean; genericName?: string }) {
    if (m.totalStock <= 0) return;
    setCart((c) => {
      const existing = c.find((it) => it.medicineId === m._id);
      if (existing) {
        return c.map((it) =>
          it.medicineId === m._id
            ? { ...it, qty: Math.min(it.qty + 1, m.totalStock) }
            : it
        );
      }
      return [...c, {
        medicineId: m._id, name: m.name, price: m.sellingPrice, qty: 1, stock: m.totalStock, discount: 0,
        prescriptionRequired: m.prescriptionRequired, isControlledSubstance: m.isControlledSubstance,
        genericName: m.genericName,
      }];
    });
    setBarcodeInput("");
    barcodeRef.current?.focus();
  }

  function changeQty(id: string, delta: number) {
    setCart((c) =>
      c.map((it) =>
        it.medicineId === id
          ? { ...it, qty: Math.max(1, Math.min(it.qty + delta, it.stock)) }
          : it
      )
    );
  }

  function setItemDiscount(id: string, disc: number) {
    setCart((c) =>
      c.map((it) =>
        it.medicineId === id
          ? { ...it, discount: Math.max(0, Math.min(disc, it.price * it.qty)) }
          : it
      )
    );
  }

  function removeItem(id: string) {
    setCart((c) => c.filter((it) => it.medicineId !== id));
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setSelectedCustomer(undefined);
  }

  const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0);
  const cartDiscount = cart.reduce((s, it) => s + it.discount, 0);
  const total = Math.max(0, subtotal - cartDiscount - discount + tax);
  const resolvedProvider = insuranceChoice === "NHIS" ? "NHIS" : insuranceOther.trim();
  const insuranceOpts =
    saleType === "insurance"
      ? { saleType: "insurance" as const, insuranceProvider: resolvedProvider, policyOrNhisNumber: policyNumber.trim() }
      : {};
  const cartRequiresRx = cart.some((l) => l.prescriptionRequired || l.isControlledSubstance);
  const cartHasControlled = cart.some((l) => l.isControlledSubstance);
  const canDispenseControlled = user?.permissions?.includes("dispense_controlled_substances") ?? false;

  const allergyWarnings: { allergy: string; medicine: string; genericName?: string }[] = (() => {
    const allergies = (selectedCustomerDetail?.allergies ?? []).map((a) => a.trim()).filter(Boolean);
    if (!allergies.length || cart.length === 0) return [];
    const warnings: { allergy: string; medicine: string; genericName?: string }[] = [];
    for (const line of cart) {
      const name = line.name.toLowerCase();
      const gen = (line.genericName ?? "").toLowerCase();
      for (const allergy of allergies) {
        const a = allergy.toLowerCase();
        if (name.includes(a) || (gen && gen.includes(a))) {
          warnings.push({ allergy, medicine: line.name, genericName: line.genericName });
        }
      }
    }
    return warnings;
  })();

  function proceedToCharge() {
    if (!paymentMethod) return;
    if (paymentMethod === "credit") {
      setShowCreditCustomer(true);
    } else {
      setShowPayment(true);
    }
  }

  async function handleCheckout(payments: SalePayment[], amountReceived?: number) {
    if (cart.length === 0 || checkingOut) return;
    if (!hasOpenSession) {
      showToast("Please open a daily session before processing sales", "error");
      return;
    }
    setCheckingOut(true);
    try {
      const sale = await createSale(
        cart.map((it) => ({ medicine: it.medicineId, quantity: it.qty, discount: it.discount })),
        payments,
        {
          customer: selectedCustomer, tax, discount, amountReceived, dueDate: creditDueDate,
          ...insuranceOpts,
          ...(rxReference ? { prescriptionReference: rxReference } : {}),
        }
      );
      showToast("Payment confirmed", "success");
      const receipt = await getSaleReceipt(sale._id);
      setShowReceipt(receipt);
      setPolicyNumber("");
      setRxReference("");
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
    } catch (err) {
      console.error("Checkout error:", err);
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Couldn't complete the sale. Try again.";
      showToast(message, "error");
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleHold() {
    if (cart.length === 0) return;
    try {
      await holdSale(
        cart.map((it) => ({ medicine: it.medicineId, quantity: it.qty, discount: it.discount })),
        { customer: selectedCustomer, discount, tax, ...insuranceOpts }
      );
      clearCart();
      showToast("Sale held", "success");
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to hold sale";
      showToast(message, "error");
    }
  }

  async function handleResumeHeld(held: HeldSale) {
    try {
      await deleteHeldSale(held._id);
      setShowHeld(false);
      showToast("Sale resumed — use payment modal to complete", "info");
    } catch {
      showToast("Failed to resume held sale", "error");
    }
  }

  async function doResumeWithPayment(held: HeldSale, payments: SalePayment[], amountReceived?: number, prescriptionReference?: string) {
    setCheckingOut(true);
    try {
      const sale = await resumeSale(held._id, payments, { amountReceived, prescriptionReference });
      showToast("Payment confirmed", "success");
      const receipt = await getSaleReceipt(sale._id);
      setShowReceipt(receipt);
      clearCart();
      setShowHeld(false);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to resume sale";
      showToast(message, "error");
    } finally {
      setCheckingOut(false);
    }
  }

  function handleResumeWithPayment(held: HeldSale, payments: SalePayment[], amountReceived?: number) {
    if (held.requiresPrescription) {
      if (held.hasControlledItems && !canDispenseControlled) {
        showToast("You don't have permission to dispense controlled substances", "error");
        return;
      }
      setPendingResume({ held, payments, amountReceived });
      setRxError("");
      setRxReference("");
      setShowRxModal(true);
      return;
    }
    void doResumeWithPayment(held, payments, amountReceived);
  }

  function confirmRxCapture() {
    const ref = rxReference.trim();
    if (!ref) {
      setRxError("Enter the prescription or reference number");
      return;
    }
    setShowRxModal(false);
    setRxError("");
    if (pendingResume) {
      const { held, payments, amountReceived } = pendingResume;
      setPendingResume(null);
      setRxReference("");
      void doResumeWithPayment(held, payments, amountReceived, ref);
      return;
    }
    setRxReference(ref);
    proceedToCharge();
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4 lg:gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-2 space-y-3 flex flex-col min-h-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft" />
            <input
              ref={barcodeRef}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan barcode → Enter"
              aria-label="Barcode scanner input"
              className="w-full pl-9 pr-3 py-2.5 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono transition"
            />
          </div>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value) setShowGrid(true); }}
              placeholder="Search product…"
              aria-label="Search products"
              className="w-full pl-9 pr-3 py-2.5 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>
        </div>

        {categories && categories.length > 0 && (
          <div className="relative">
            <div
              className="flex gap-2 items-center overflow-x-auto flex-nowrap pb-1 -mx-0.5 px-0.5 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none", maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)", WebkitMaskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)" }}
            >
            <button
              onClick={() => {
                if (showGrid && !search && !categoryFilter) {
                  setShowGrid(false);
                } else {
                  setShowGrid(true);
                  setCategoryFilter("");
                  setSearch("");
                }
              }}
              className={`flex-shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                showGrid && !categoryFilter && !search
                  ? "bg-blue-600 border-blue-600 text-white shadow-[0_6px_16px_rgba(28,100,242,0.35)]"
                  : "bg-white border-line text-navy hover:border-line-soft"
              }`}
            >
              <span className="whitespace-nowrap">All</span>
              <span
                className={`text-xs tabular-nums ${
                  showGrid && !categoryFilter && !search ? "text-white/75" : "bg-blue-100 text-blue-700"
                } rounded-md px-1.5 py-0.5`}
              >
                {medicines?.length ?? 0}
              </span>
            </button>
            {categories.map((c, i) => {
              const count = medicines?.filter((m) => typeof m.category === "object" && m.category?._id === c._id).length ?? 0;
              const active = categoryFilter === c._id;
              const pal = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
              return (
                <button
                  key={c._id}
                  onClick={() => {
                    if (active) {
                      setCategoryFilter("");
                      setShowGrid(false);
                    } else {
                      setCategoryFilter(c._id);
                      setShowGrid(true);
                      setSearch("");
                    }
                  }}
                  className={`flex-shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    active ? pal.active : pal.idle
                  }`}
                >
                  <span className="whitespace-nowrap">{c.name}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${active ? pal.countActive : pal.countIdle}`}>
                    {count}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${active ? "rotate-180" : ""}`}
                  />
                </button>
              );
            })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!showGrid && (
            <div className="flex flex-col items-center justify-center h-full text-gray-soft">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="mt-3 text-sm">Search for a product or click "View All" to browse</p>
            </div>
          )}

          {showGrid && (
            <>
              {/* Table view for search results */}
              {search && !categoryFilter ? (
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-paper text-left">
                        <th className="px-3 py-2 text-[11px] font-medium text-gray">Product Name</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-gray">Expiry Date</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-gray">Unit Price</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-gray text-right">Stock</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-gray text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {medicinesLoading && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-soft text-sm"><Loader2 size={16} className="animate-spin inline mr-2" />Searching...</td></tr>
                      )}
                      {!medicinesLoading && medicines?.filter((m) => !categoryFilter || (typeof m.category === "object" && m.category?._id === categoryFilter)).map((m) => {
                        const out = m.totalStock <= 0;
                        const inCart = cart.find((it) => it.medicineId === m._id);
                        const expiryDays = m.nearestExpiry ? Math.ceil((new Date(m.nearestExpiry).getTime() - Date.now()) / 86400000) : null;
                        return (
                          <tr
                            key={m._id}
                            className={`${out ? "opacity-40" : "cursor-pointer"} hover:bg-paper transition`}
                            onClick={() => { if (!out) addToCart(m); }}
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded bg-paper flex items-center justify-center flex-shrink-0 overflow-hidden">
                                  <ProductThumb medicine={m} size={14} />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-navy truncate">{m.name}</p>
                                  {m.genericName && <p className="text-[11px] text-gray-soft truncate">{m.genericName}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {m.nearestExpiry ? (
                                <span className={`text-xs ${expiryDays !== null && expiryDays <= 30 ? "text-red font-medium" : "text-gray"}`}>
                                  {new Date(m.nearestExpiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                  {expiryDays !== null && <span className="ml-1 text-[10px]">({expiryDays}d)</span>}
                                </span>
                              ) : <span className="text-xs text-gray-soft">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-sm tabular-nums">{ghs(m.sellingPrice)}</td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-xs font-medium ${m.totalStock <= 10 ? "text-red" : "text-gray"}`}>
                                {m.totalStock}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedProduct(m); }}
                                  className="p-1.5 hover:bg-paper rounded-lg transition"
                                  title="View details"
                                >
                                  <Eye size={14} className="text-gray-soft" />
                                </button>
                                {!out && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); addToCart(m); }}
                                    className="p-1.5 hover:bg-blue-50 rounded-lg transition"
                                    title={inCart ? `In cart (${inCart.qty})` : "Add to cart"}
                                  >
                                    <Plus size={14} className={inCart ? "text-blue-600" : "text-gray-soft"} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!medicinesLoading && medicines && medicines.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-soft text-sm">No products found for "{search}"</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Grid view for categories / View All */
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 auto-rows-min content-start">
                  {medicinesLoading && (
                    <div className="sm:col-span-2 xl:col-span-3 flex items-center justify-center py-8 text-gray-soft text-sm">
                      <Loader2 size={18} className="animate-spin mr-2" /> Loading products…
                    </div>
                  )}
                  {!medicinesLoading && medicines?.filter((m) => !categoryFilter || (typeof m.category === "object" && m.category?._id === categoryFilter)).map((m) => {
                    const out = m.totalStock <= 0;
                    const inCart = cart.find((it) => it.medicineId === m._id);
                    const expiryDays = m.nearestExpiry ? Math.ceil((new Date(m.nearestExpiry).getTime() - Date.now()) / 86400000) : null;
                    const expiringSoon = expiryDays !== null && expiryDays <= 30;
                    return (
                      <button
                        key={m._id}
                        onClick={() => addToCart(m)}
                        disabled={out}
                        className={`text-left bg-white rounded-card border p-3 hover:border-blue-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                          out ? "opacity-40 cursor-not-allowed border-line" : inCart ? "border-blue-500 shadow-[0_4px_16px_rgba(28,100,242,0.12)]" : "border-line"
                        }`}
                        aria-label={`${m.name}, ${ghs(m.sellingPrice)}, ${m.totalStock} in stock${out ? ", out of stock" : ""}`}
                      >
                        <div className="flex gap-3">
                          <div className="w-12 h-12 rounded-lg bg-paper flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
                            {m.imageUrl ? (
                              <>
                                <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setViewingImage({ url: m.imageUrl!, name: m.name, medicine: m }); }}
                                  className="absolute inset-0 bg-gray-soft opacity-0 group-hover:opacity-100 flex items-center justify-center transition focus:outline-none"
                                  aria-label={`View image of ${m.name}`}
                                >
                                  <Eye size={16} className="text-white" />
                                </button>
                              </>
                            ) : (
                              <ProductThumb medicine={m} size={20} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-0.5 text-navy truncate">{m.name}</div>
                            {m.genericName && <div className="text-[11px] text-gray-soft truncate">{m.genericName}</div>}
                            <div className="flex items-center gap-2 mt-1">
                              {m.form && <span className="text-[10px] bg-paper text-gray px-1.5 py-0.5 rounded">{m.form}</span>}
                              {m.prescriptionRequired && (
                                <span className="text-[10px] bg-amber-bg text-amber px-1.5 py-0.5 rounded-full font-medium">Rx</span>
                              )}
                              {m.isControlledSubstance && (
                                <span className="text-[10px] bg-red-bg text-red px-1.5 py-0.5 rounded-full font-medium">Controlled</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-paper">
                          <span className="font-semibold text-blue-700 text-sm">{ghs(m.sellingPrice)}</span>
                          <div className="flex items-center gap-2">
                            {expiryDays !== null && (
                              <span className={`text-[10px] flex items-center gap-0.5 ${expiringSoon ? "text-red" : "text-gray-soft"}`}>
                                {expiringSoon ? <AlertTriangle size={10} /> : <Clock size={10} />}
                                {expiryDays}d
                              </span>
                            )}
                            <span className={`text-xs font-medium ${m.totalStock <= 10 ? "text-red" : "text-gray-soft"}`}>
                              {m.totalStock} in stock
                            </span>
                          </div>
                        </div>
                        {inCart && (
                          <div className="mt-1 text-[10px] text-blue-600 font-medium">
                            ×{inCart.qty} in cart
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {!medicinesLoading && medicines && medicines.length === 0 && (
                    <div className="sm:col-span-2 xl:col-span-3 text-center py-8 text-gray-soft text-sm">
                      No products found
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-card border border-line p-4 h-fit lg:h-full lg:overflow-y-auto flex flex-col">
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2">
            {selectedCustomer ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium min-w-0">
                <UserPlus size={12} className="flex-shrink-0" />
                <span className="truncate">{selectedCustomerDetail?.name ?? "Customer selected"}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper border border-line text-gray text-xs font-medium">
                <User size={12} />
                Walk-in customer
              </span>
            )}
            <button
              onClick={() => setShowCustomerSearch(!showCustomerSearch)}
              className="flex items-center gap-1.5 text-xs text-gray hover:text-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded px-1 py-0.5 flex-shrink-0"
            >
              <UserPlus size={14} />
              {showCustomerSearch ? "Close" : selectedCustomer ? "Change" : "Select customer"}
            </button>
          </div>
          {showCustomerSearch && (
            <div className="mt-2 space-y-2">
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by name or phone"
                aria-label="Search customers"
                className="w-full px-3 py-2 rounded-control border border-line text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
              {customers && customers.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1" role="listbox">
                  {customers.map((c) => (
                    <button
                      key={c._id}
                      role="option"
                      aria-selected={selectedCustomer === c._id}
                      onClick={() => {
                        setSelectedCustomer(c._id);
                        setShowCustomerSearch(false);
                        setCustomerSearch("");
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-blue-50 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                        selectedCustomer === c._id ? "bg-blue-50 text-blue-700" : ""
                      }`}
                    >
                      {c.name} — {c.phone}
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer && (
                <button
                  onClick={() => setSelectedCustomer(undefined)}
                  className="text-xs text-red hover:text-red focus:outline-none focus:ring-2 focus:ring-red/30 rounded px-1"
                >
                  Back to walk-in
                </button>
              )}
            </div>
          )}
        </div>

        {allergyWarnings.length > 0 && (
          <div className="mb-3 rounded-xl bg-red-bg border border-red/30 p-3 space-y-1" role="alert">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red">
              <AlertTriangle size={14} />
              Allergy alert{selectedCustomerDetail ? ` — ${selectedCustomerDetail.name}` : ""}
            </div>
            {allergyWarnings.map((w, i) => (
              <div key={`${w.allergy}-${w.medicine}-${i}`} className="text-xs text-red">
                <span className="font-medium">{w.allergy}</span> may conflict with{" "}
                <span className="font-medium">{w.medicine}</span>
                {w.genericName ? ` (${w.genericName})` : ""}
              </div>
            ))}
          </div>
        )}

        <h2 className="text-sm font-medium mb-2 flex items-center justify-between text-navy">
          <span className="flex items-center gap-2"><ShoppingCart size={16} /> Cart</span>
          <div className="flex gap-1">
            <button
              onClick={loadHeld}
              className="p-1.5 rounded-md hover:bg-paper text-gray-soft hover:text-gray focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              title="View held sales"
              aria-label="View held sales"
            >
              <Pause size={14} />
            </button>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="p-1.5 rounded-md hover:bg-red-bg text-gray-soft hover:text-red focus:outline-none focus:ring-2 focus:ring-red/30"
                title="Clear cart"
                aria-label="Clear cart"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </h2>

        {cart.length === 0 ? (
          <p className="text-sm text-gray-soft py-8 text-center">
            Cart is empty<br />
            <span className="text-xs">Scan a barcode or tap a product</span>
          </p>
        ) : (
          <div className="space-y-2 mb-3 max-h-60 overflow-y-auto pr-1">
            {cart.map((it) => (
              <div key={it.medicineId} className="flex items-center justify-between gap-2 bg-blue-50 rounded-control px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate text-navy font-medium">{it.name}</div>
                  <div className="text-xs text-gray-soft">
                    {ghs(it.price)} each
                    {it.discount > 0 && (
                      <span className="text-red ml-1">-{ghs(it.discount)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeQty(it.medicineId, -1)}
                    className="w-7 h-7 rounded-full border border-line flex items-center justify-center hover:bg-paper transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    aria-label={`Decrease ${it.name} quantity`}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium tabular-nums">{it.qty}</span>
                  <button
                    onClick={() => changeQty(it.medicineId, 1)}
                    className="w-7 h-7 rounded-full border border-line flex items-center justify-center hover:bg-paper transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    aria-label={`Increase ${it.name} quantity`}
                  >
                    <Plus size={12} />
                  </button>
                  {canDiscount && (
                    <input
                      type="number"
                      value={it.discount || ""}
                      onChange={(e) => setItemDiscount(it.medicineId, Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      aria-label={`${it.name} discount`}
                      className="w-14 text-right px-1 py-0.5 rounded border border-line text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 tabular-nums"
                    />
                  )}
                  <button
                    onClick={() => removeItem(it.medicineId)}
                    className="ml-1 text-gray-soft hover:text-red focus:outline-none focus:ring-2 focus:ring-red/30 rounded p-0.5"
                    aria-label={`Remove ${it.name} from cart`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between text-sm text-gray">
              <span>Subtotal</span>
              <span className="tabular-nums">{ghs(subtotal)}</span>
            </div>

            {cartDiscount > 0 && (
              <div className="flex items-center justify-between text-sm text-red">
                <span>Item discounts</span>
                <span className="tabular-nums">-{ghs(cartDiscount)}</span>
              </div>
            )}

            {canDiscount && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray flex items-center gap-1"><Tag size={12} /> Discount</span>
                <input
                  type="number"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                  aria-label="Total discount"
                  className="w-20 text-right px-2 py-1 rounded border border-line text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 tabular-nums"
                />
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray">Tax</span>
              <input
                type="number"
                value={tax || ""}
                onChange={(e) => setTax(Math.max(0, Number(e.target.value)))}
                placeholder="0.00"
                aria-label="Tax amount"
                className="w-20 text-right px-2 py-1 rounded border border-line text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 tabular-nums"
              />
            </div>

            <div className="border-t border-line pt-3 flex items-center justify-between">
              <span className="text-lg font-semibold text-navy">Total Due</span>
              <span className="text-2xl font-extrabold text-blue-600 tabular-nums">{ghs(total)}</span>
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-xs font-medium text-gray">Type of sale</div>
            <div className="grid grid-cols-2 gap-2">
              {(["retail", "insurance"] as const).map((t) => {
                const active = saleType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSaleType(t);
                      setPaymentMethod(t === "insurance" ? "insurance" : null);
                    }}
                    disabled={checkingOut}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40 ${
                      active
                        ? "bg-blue-100 border-blue-600 text-blue-700"
                        : "bg-white border-line text-navy hover:border-line-soft shadow-panel"
                    }`}
                    aria-pressed={active}
                  >
                    {t === "retail" ? <ShoppingCart size={14} /> : <ShieldCheck size={14} />}
                    {t === "retail" ? "Retail" : "Insurance"}
                  </button>
                );
              })}
            </div>
            {saleType === "insurance" && (
              <div className="space-y-2 rounded-xl bg-blue-50/60 border border-blue-100 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={insuranceChoice}
                    onChange={(e) => setInsuranceChoice(e.target.value as "NHIS" | "other")}
                    disabled={checkingOut}
                    aria-label="Insurance provider"
                    className="px-3 py-2 rounded-lg border border-line text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
                  >
                    <option value="NHIS">NHIS</option>
                    <option value="other">Other provider</option>
                  </select>
                  <input
                    type="text"
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    disabled={checkingOut}
                    placeholder="Policy / NHIS number"
                    aria-label="Policy or NHIS number"
                    className="px-3 py-2 rounded-lg border border-line text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
                  />
                </div>
                {insuranceChoice === "other" && (
                  <input
                    type="text"
                    value={insuranceOther}
                    onChange={(e) => setInsuranceOther(e.target.value)}
                    disabled={checkingOut}
                    placeholder="Provider name"
                    aria-label="Insurance provider name"
                    className="w-full px-3 py-2 rounded-lg border border-line text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {cart.length > 0 && saleType === "retail" && (
          <div className="mt-3 space-y-1.5">
            <div className="text-xs font-medium text-gray">Payment method</div>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "mobile_money", "card", "credit"] as const).map((key) => {
                const m = PAY_METHODS.find((p) => p.key === key)!;
                const Icon = m.icon;
                const active = paymentMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key)}
                    disabled={checkingOut}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40 ${
                      active
                        ? "bg-blue-100 border-blue-600 text-blue-700"
                        : "bg-white border-line text-navy hover:border-line-soft shadow-panel"
                    }`}
                    aria-pressed={active}
                  >
                    <Icon size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {cart.length > 0 && saleType === "insurance" && (
          <div className="mt-3 space-y-1.5">
            <div className="text-xs font-medium text-gray">Payment method</div>
            <button
              type="button"
              aria-pressed
              disabled
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium bg-blue-100 border-blue-600 text-blue-700 opacity-100"
            >
              <ShieldCheck size={14} />
              Insurance{resolvedProvider ? ` — ${resolvedProvider}` : ""}
            </button>
          </div>
        )}

        {cart.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              onClick={handleHold}
              disabled={checkingOut || !hasOpenSession}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-card text-xs font-medium border border-line text-navy hover:bg-paper transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40"
            >
              <Pause size={14} />
              Hold
            </button>
            <button
              onClick={clearCart}
              disabled={checkingOut}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-card text-xs font-medium bg-red-bg text-red hover:bg-red/10 transition focus:outline-none focus:ring-2 focus:ring-red/30 disabled:opacity-40"
            >
              <X size={14} />
              Void
            </button>
            <button
              onClick={() => {
                if (!paymentMethod) return;
                if (saleType === "insurance") {
                  if (!selectedCustomer) {
                    showToast("Select a registered customer for insurance sales", "error");
                    return;
                  }
                  if (!resolvedProvider) {
                    showToast("Enter the insurance provider name", "error");
                    return;
                  }
                  if (!policyNumber.trim()) {
                    showToast("Enter the policy or NHIS number", "error");
                    return;
                  }
                }
                if (cartRequiresRx) {
                  if (cartHasControlled && !canDispenseControlled) {
                    showToast("You don't have permission to dispense controlled substances", "error");
                    return;
                  }
                  setRxError("");
                  setRxReference("");
                  setShowRxModal(true);
                  return;
                }
                proceedToCharge();
              }}
              disabled={checkingOut || !hasOpenSession || !paymentMethod}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-card text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-[0_6px_16px_rgba(28,100,242,0.3)] transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40"
            >
              <Banknote size={14} />
              Charge
            </button>
          </div>
        )}

        {!hasOpenSession && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-amber-bg border border-amber text-amber text-xs text-center">
            Open a daily session before processing sales
          </div>
        )}
      </div>

      {showCreditCustomer && (
        <CreditCustomerModal
          dueDate={creditDueDate}
          onDueDateChange={setCreditDueDate}
          selectedCustomerId={selectedCustomer}
          onSaved={(customerId) => {
            setSelectedCustomer(customerId);
            setShowCreditCustomer(false);
            setShowPayment(true);
          }}
          onCancel={() => setShowCreditCustomer(false)}
        />
      )}

      {showPayment && (
        <PaymentModal
          total={total}
          itemCount={cart.reduce((s, it) => s + it.qty, 0)}
          initialMethod={paymentMethod ?? "cash"}
          onConfirm={(payments, amountReceived) => {
            setShowPayment(false);
            handleCheckout(payments, amountReceived);
          }}
          onCancel={() => setShowPayment(false)}
        />
      )}

      {showRxModal && (
        <Modal
          open
          onClose={() => {
            setShowRxModal(false);
            setRxError("");
            setPendingResume(null);
          }}
          title="Prescription required"
          size="sm"
        >
          <div className="space-y-3">
            <p className="text-sm text-gray">
              {pendingResume
                ? "This held sale contains prescription or controlled items. Enter the prescription reference to complete the sale."
                : "This cart contains prescription or controlled items. Enter the prescription reference to continue."}
            </p>
            <div className="rounded-lg bg-paper border border-line p-2.5 max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {(pendingResume
                  ? pendingResume.held.items.map((i) => ({ key: i.medicine, label: `${i.name} ×${i.quantity}`, controlled: false }))
                  : cart
                      .filter((l) => l.prescriptionRequired || l.isControlledSubstance)
                      .map((l) => ({ key: l.medicineId, label: `${l.name} ×${l.qty}`, controlled: Boolean(l.isControlledSubstance) }))
                ).map((line) => (
                  <li key={line.key} className="flex items-center justify-between gap-2 text-xs text-navy">
                    <span>{line.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${line.controlled || pendingResume?.held.hasControlledItems ? "bg-red-bg text-red" : "bg-blue-100 text-blue-700"}`}>
                      {line.controlled || pendingResume?.held.hasControlledItems ? "Controlled" : "Rx"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label htmlFor="rx-reference" className="text-xs font-medium text-gray block mb-1">
                Prescription / reference number
              </label>
              <input
                id="rx-reference"
                type="text"
                value={rxReference}
                onChange={(e) => setRxReference(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRxCapture();
                }}
                placeholder="e.g. RX-2026-0143"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
              />
              {rxError && <p className="text-xs text-red mt-1">{rxError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowRxModal(false);
                  setRxError("");
                  setPendingResume(null);
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-line text-navy hover:bg-paper transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRxCapture}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                Confirm & continue
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showHeld && (
        <HeldSalesModal
          heldSales={heldSales}
          onResume={(h) => handleResumeHeld(h)}
          onResumeWithPayment={(h, payments, amt) => {
            setShowHeld(false);
            handleResumeWithPayment(h, payments, amt);
          }}
          onDelete={async (h) => {
            await deleteHeldSale(h._id);
            setHeldSales((prev) => prev.filter((s) => s._id !== h._id));
          }}
          onClose={() => setShowHeld(false)}
        />
      )}

      {showReceipt && (
        <ReceiptModal receipt={showReceipt} onClose={() => setShowReceipt(null)} />
      )}

      {viewingImage && (
        <Modal open onClose={() => setViewingImage(null)} title={viewingImage.name} size="lg">
          <div className="flex flex-col md:flex-row gap-5">
            <div className="flex-shrink-0 flex items-center justify-center">
              <img src={viewingImage.url} alt={viewingImage.name} className="w-full md:w-64 h-48 md:h-64 rounded-lg object-cover border border-line" />
            </div>
            <div className="flex-1 space-y-3 text-sm">
              <div>
                <div className="text-navy font-medium text-base">{viewingImage.name}</div>
                {viewingImage.medicine.genericName && <div className="text-gray text-xs mt-0.5">{viewingImage.medicine.genericName}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-paper rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-soft uppercase tracking-wide">Price</div>
                  <div className="text-blue-700 font-semibold">{ghs(viewingImage.medicine.sellingPrice)}</div>
                </div>
                <div className="bg-paper rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-soft uppercase tracking-wide">Stock</div>
                  <div className={`font-semibold ${viewingImage.medicine.totalStock <= 10 ? "text-red" : "text-navy"}`}>
                    {viewingImage.medicine.totalStock} {viewingImage.medicine.totalStock <= 0 ? "(Out of stock)" : "in stock"}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                {viewingImage.medicine.barcode && (
                  <div className="flex justify-between"><span className="text-gray">Barcode</span><span className="font-mono text-navy">{viewingImage.medicine.barcode}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray">SKU</span><span className="font-mono text-navy">{viewingImage.medicine.sku}</span></div>
                {viewingImage.medicine.form && (
                  <div className="flex justify-between"><span className="text-gray">Form</span><span className="text-navy capitalize">{viewingImage.medicine.form}</span></div>
                )}
                {viewingImage.medicine.strength && (
                  <div className="flex justify-between"><span className="text-gray">Strength</span><span className="text-navy">{viewingImage.medicine.strength}</span></div>
                )}
                {viewingImage.medicine.dosage && (
                  <div className="flex justify-between"><span className="text-gray">Dosage</span><span className="text-navy">{viewingImage.medicine.dosage}</span></div>
                )}
                {viewingImage.medicine.brand && (
                  <div className="flex justify-between"><span className="text-gray">Brand</span><span className="text-navy">{viewingImage.medicine.brand}</span></div>
                )}
                {viewingImage.medicine.manufacturer && (
                  <div className="flex justify-between"><span className="text-gray">Manufacturer</span><span className="text-navy">{viewingImage.medicine.manufacturer}</span></div>
                )}
                {viewingImage.medicine.nearestExpiry && (
                  <div className="flex justify-between">
                    <span className="text-gray">Expiry</span>
                    <span className={Math.ceil((new Date(viewingImage.medicine.nearestExpiry).getTime() - Date.now()) / 86400000) <= 30 ? "text-red font-medium" : "text-navy"}>
                      {new Date(viewingImage.medicine.nearestExpiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      ({Math.max(0, Math.ceil((new Date(viewingImage.medicine.nearestExpiry).getTime() - Date.now()) / 86400000))}d left)
                    </span>
                  </div>
                )}
                {viewingImage.medicine.prescriptionRequired && (
                  <div className="flex justify-between"><span className="text-gray">Rx Required</span><span className="text-amber font-medium">Yes</span></div>
                )}
              </div>
              <button
                onClick={() => { if (viewingImage.medicine.totalStock > 0) { addToCart(viewingImage.medicine); setViewingImage(null); } }}
                disabled={viewingImage.medicine.totalStock <= 0}
                className="w-full mt-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition"
              >
                {viewingImage.medicine.totalStock <= 0 ? "Out of Stock" : "Add to Cart"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {expandedProduct && (
        <Modal open onClose={() => setExpandedProduct(null)} title={expandedProduct.name} size="lg">
          <div className="space-y-4 text-sm">
            <div className="flex gap-4">
              {expandedProduct.imageUrl && (
                <img src={expandedProduct.imageUrl} alt={expandedProduct.name} className="w-24 h-24 rounded-lg object-cover border border-line flex-shrink-0" />
              )}
              <div className="flex-1">
                <div className="text-navy font-medium text-base">{expandedProduct.name}</div>
                {expandedProduct.genericName && <div className="text-gray text-xs mt-0.5">{expandedProduct.genericName}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {expandedProduct.form && <span className="text-[10px] bg-paper text-gray px-1.5 py-0.5 rounded">{expandedProduct.form}</span>}
                  {expandedProduct.prescriptionRequired && <span className="text-[10px] bg-amber-bg text-amber px-1.5 py-0.5 rounded-full font-medium">Rx</span>}
                  {expandedProduct.isControlledSubstance && <span className="text-[10px] bg-red-bg text-red px-1.5 py-0.5 rounded-full font-medium">Controlled</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-paper rounded-lg px-3 py-2">
                <div className="text-[10px] text-gray-soft uppercase tracking-wide">Selling Price</div>
                <div className="text-blue-700 font-semibold">{ghs(expandedProduct.sellingPrice)}</div>
              </div>
              <div className="bg-paper rounded-lg px-3 py-2">
                <div className="text-[10px] text-gray-soft uppercase tracking-wide">Cost Price</div>
                <div className="font-semibold">{ghs(expandedProduct.purchasePrice)}</div>
              </div>
              <div className="bg-paper rounded-lg px-3 py-2">
                <div className="text-[10px] text-gray-soft uppercase tracking-wide">Stock</div>
                <div className={`font-semibold ${expandedProduct.totalStock <= 10 ? "text-red" : "text-navy"}`}>
                  {expandedProduct.totalStock} {expandedProduct.totalStock <= 0 ? "(Out of stock)" : "in stock"}
                </div>
              </div>
              <div className="bg-paper rounded-lg px-3 py-2">
                <div className="text-[10px] text-gray-soft uppercase tracking-wide">Reorder Level</div>
                <div className="font-semibold">{expandedProduct.reorderLevel}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              {expandedProduct.barcode && (
                <div className="flex justify-between"><span className="text-gray">Barcode</span><span className="font-mono text-navy">{expandedProduct.barcode}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray">SKU</span><span className="font-mono text-navy">{expandedProduct.sku}</span></div>
              {expandedProduct.strength && (
                <div className="flex justify-between"><span className="text-gray">Strength</span><span className="text-navy">{expandedProduct.strength}</span></div>
              )}
              {expandedProduct.dosage && (
                <div className="flex justify-between"><span className="text-gray">Dosage</span><span className="text-navy">{expandedProduct.dosage}</span></div>
              )}
              {expandedProduct.brand && (
                <div className="flex justify-between"><span className="text-gray">Brand</span><span className="text-navy">{expandedProduct.brand}</span></div>
              )}
              {expandedProduct.manufacturer && (
                <div className="flex justify-between"><span className="text-gray">Manufacturer</span><span className="text-navy">{expandedProduct.manufacturer}</span></div>
              )}
              {expandedProduct.nearestExpiry && (
                <div className="flex justify-between">
                  <span className="text-gray">Expiry</span>
                  <span className={Math.ceil((new Date(expandedProduct.nearestExpiry).getTime() - Date.now()) / 86400000) <= 30 ? "text-red font-medium" : "text-navy"}>
                    {new Date(expandedProduct.nearestExpiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    ({Math.max(0, Math.ceil((new Date(expandedProduct.nearestExpiry).getTime() - Date.now()) / 86400000))}d left)
                  </span>
                </div>
              )}
              {expandedProduct.description && (
                <div className="mt-2 pt-2 border-t border-paper">
                  <span className="text-gray">Description</span>
                  <p className="text-navy mt-1">{expandedProduct.description}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => { if (expandedProduct.totalStock > 0) { addToCart(expandedProduct); setExpandedProduct(null); } }}
              disabled={expandedProduct.totalStock <= 0}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition"
            >
              {expandedProduct.totalStock <= 0 ? "Out of Stock" : "Add to Cart"}
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

function PaymentModal({
  total,
  itemCount,
  initialMethod = "cash",
  onConfirm,
  onCancel,
}: {
  total: number;
  itemCount?: number;
  initialMethod?: SalePayment["method"];
  onConfirm: (payments: SalePayment[], amountReceived?: number) => void;
  onCancel: () => void;
}) {
  const [payments, setPayments] = useState<SalePayment[]>(() => [{
    method: initialMethod,
    amount: total,
    date: new Date().toISOString(),
    ...(initialMethod !== "cash" ? { reference: genPaymentRef(initialMethod) } : {}),
  }]);
  const [cashReceived, setCashReceived] = useState<string>(String(Math.ceil(total)));
  const [showKeypad, setShowKeypad] = useState(false);
  const hasCash = payments.some((p) => p.method === "cash");
  const isCash = hasCash && payments.length === 1;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, (isCash ? parseFloat(cashReceived) || 0 : totalPaid) - total);
  const balance = total - totalPaid;

  function addPayment() {
    setPayments((prev) => [...prev, { method: "card", amount: 0, date: new Date().toISOString(), reference: genPaymentRef("card") }]);
  }

  function updatePayment(i: number, field: keyof SalePayment, value: string | number) {
    setPayments((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      if (field === "method") {
        const method = value as SalePayment["method"];
        return { ...p, method, reference: genPaymentRef(method) };
      }
      return { ...p, [field]: value };
    }));
  }

  function removePayment(i: number) {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  const valid = payments.length > 0 && totalPaid >= total && payments.every((p) => p.amount > 0);

  return (
    <Modal open onClose={onCancel} title="Payment" size="md">
      <div className="text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-soft mb-1">Amount due</div>
        <span className="text-3xl font-semibold text-blue-700 tabular-nums">{ghs(total)}</span>
        {itemCount != null && (
          <div className="text-xs text-gray-soft mt-1">{itemCount} item{itemCount === 1 ? "" : "s"} in this sale</div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-soft">
          <span className="flex-1">Method</span>
          <span className="w-24">Amount</span>
          <span className="w-28">Reference</span>
        </div>
        {payments.map((p, i) => (
          <div key={i} className="flex gap-2 items-start">
            <select
              value={p.method}
              onChange={(e) => updatePayment(i, "method", e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition bg-white"
              aria-label={`Payment ${i + 1} method`}
            >
              {PAY_METHODS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={p.amount || ""}
              onChange={(e) => updatePayment(i, "amount", Math.max(0, Number(e.target.value) || 0))}
              placeholder="Amount"
              aria-label={`Payment ${i + 1} amount`}
              className={`${AMOUNT_INPUT_CLASS} bg-white`}
            />
            {p.method !== "cash" ? (
              <span
                className="w-28 px-2 py-2 rounded-lg border border-line bg-paper text-[10px] font-mono text-gray break-all leading-tight select-all"
                title={p.reference}
                aria-label={`Payment ${i + 1} reference`}
              >
                {p.reference}
              </span>
            ) : (
              <span className="w-28 text-center text-[11px] text-gray-soft py-2" aria-hidden="true">—</span>
            )}
            {payments.length > 1 && (
              <button onClick={() => removePayment(i)} className="text-gray-soft hover:text-red mt-1 focus:outline-none focus:ring-2 focus:ring-red/30 rounded p-0.5" aria-label="Remove payment">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addPayment} className="w-full text-xs text-blue-700 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded py-1">
        + Add another payment
      </button>

      {hasCash && (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray">Cash received</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                aria-label="Cash received"
                className="w-28 text-right px-2 py-1 rounded border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 tabular-nums transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setCashReceived(String(total))}
                className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition"
              >
                Exact
              </button>
              <button
                type="button"
                onClick={() => setShowKeypad(!showKeypad)}
                className={`p-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${showKeypad ? "bg-blue-50 text-blue-700" : "text-gray-soft hover:text-gray"}`}
                aria-label="Toggle keypad"
              >
                <Keyboard size={16} />
              </button>
            </div>
          </div>
          {showKeypad && (
            <NumericKeypad
              value={cashReceived}
              onChange={setCashReceived}
              onConfirm={() => setShowKeypad(false)}
              className="mt-2"
            />
          )}
          {change > 0 && (
            <div className="flex items-center justify-between text-sm font-medium text-blue-700">
              <span>Change</span>
              <span className="tabular-nums">{ghs(change)}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line pt-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray">
          <span>Total paid</span>
          <span className="tabular-nums">{ghs(totalPaid)}</span>
        </div>
        {balance > 0 && (
          <div className="flex justify-between text-red">
            <span>Balance due</span>
            <span className="tabular-nums">{ghs(balance)}</span>
          </div>
        )}
        {balance <= 0 && !isCash && (
          <div className="flex justify-between text-green font-medium">
            <span>Paid in full</span>
            <span className="tabular-nums">{ghs(totalPaid)}</span>
          </div>
        )}
      </div>

      <Button
        onClick={() => {
          const amt = isCash ? parseFloat(cashReceived) || 0 : totalPaid;
          onConfirm(payments, isCash ? amt : undefined);
        }}
        disabled={!valid}
        className="w-full"
        size="lg"
      >
        Confirm payment
      </Button>
    </Modal>
  );
}

function HeldSalesModal({ heldSales, onResume, onResumeWithPayment, onDelete, onClose }: {
  heldSales: HeldSale[];
  onResume: (h: HeldSale) => void;
  onResumeWithPayment: (h: HeldSale, payments: SalePayment[], amountReceived?: number) => void;
  onDelete: (h: HeldSale) => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Held Sales" size="md">
      {heldSales.length === 0 ? (
        <p className="text-sm text-gray-soft py-6 text-center">No held sales</p>
      ) : (
        <div className="space-y-3">
          {heldSales.map((h) => (
            <div key={h._id} className="border border-line rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-navy">{h.transactionNumber}</span>
                <span className="font-semibold text-blue-700 tabular-nums">{ghs(h.total)}</span>
              </div>
              <div className="text-xs text-gray-soft">
                {h.items.length} item(s) — {new Date(h.createdAt).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onResumeWithPayment(h, [{ method: "cash", amount: h.total, date: new Date().toISOString() }], h.total)}
                  className="flex-1"
                >
                  Pay now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDelete(h)}
                  className="text-red border-red hover:bg-red-bg"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: SaleReceipt; onClose: () => void }) {
  function handlePrint() {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const logoHtml = receipt.logoUrl ? `<img src="${receipt.logoUrl}" style="max-height:60px;margin:0 auto 8px;display:block" />` : "";
    win.document.write(`<html><head><title>Receipt</title><style>
      body{font-family:monospace;padding:16px;max-width:300px;margin:0 auto;font-size:12px}
      .center{text-align:center} .line{border-top:1px dashed #ccc;margin:8px 0}
      .row{display:flex;justify-content:space-between}
      .bold{font-weight:bold} .small{font-size:10px;color:#666}
    </style></head><body>
      <div class="center">${logoHtml}<b>${receipt.name}</b><br><span class="small">${receipt.address}<br>${receipt.phone}</span></div>
      <div class="line"></div>
      <div class="row"><span>Receipt:</span><span>${receipt.receipt}</span></div>
      <div class="row"><span>Date:</span><span>${new Date(receipt.date).toLocaleString()}</span></div>
      <div class="row"><span>Cashier:</span><span>${receipt.cashier}</span></div>
      ${receipt.customer ? `<div class="row"><span>Customer:</span><span>${receipt.customer}</span></div>` : ""}
      <div class="line"></div>
      ${receipt.items.map((it) => `<div class="row"><span>${it.name} x${it.quantity}</span><span>${ghs(it.subtotal)}</span></div>`).join("")}
      <div class="line"></div>
      <div class="row"><span>Subtotal</span><span>${ghs(receipt.subtotal)}</span></div>
      ${receipt.discount > 0 ? `<div class="row"><span>Discount</span><span>-${ghs(receipt.discount)}</span></div>` : ""}
      ${receipt.tax > 0 ? `<div class="row"><span>Tax</span><span>${ghs(receipt.tax)}</span></div>` : ""}
      <div class="row bold"><span>Total</span><span>${ghs(receipt.total)}</span></div>
      <div class="line"></div>
      <div class="bold" style="font-size:11px;margin-bottom:2px">Payment</div>
      ${receipt.payments.map((p) => `<div class="row"><span>${p.method.replace(/_/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase())}</span><span>${ghs(p.amount)}${p.reference ? ` (${p.reference})` : ""}</span></div>`).join("")}
      ${receipt.amountReceived != null ? `<div class="row"><span>Received</span><span>${ghs(receipt.amountReceived)}</span></div>` : ""}
      ${receipt.change != null && receipt.change > 0 ? `<div class="row bold"><span>Change</span><span>${ghs(receipt.change)}</span></div>` : ""}
      <div class="line"></div>
      <div class="center small">Thank you for your purchase!</div>
    </body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <Modal open onClose={onClose} title={receipt.name} size="sm">
      {receipt.logoUrl && (
        <div className="flex justify-center mb-2">
          <img src={receipt.logoUrl} alt={receipt.name} className="h-12 object-contain" />
        </div>
      )}
      <div className="text-center space-y-1 mb-4">
        <p className="text-xs text-gray-soft">{receipt.address}</p>
        <p className="text-xs text-gray-soft">{receipt.phone}</p>
      </div>

      <div className="border-t border-dashed border-line pt-3 space-y-2 text-sm">
        <div className="flex justify-between text-gray"><span>Receipt</span><span>{receipt.receipt}</span></div>
        <div className="flex justify-between text-gray"><span>Date</span><span>{new Date(receipt.date).toLocaleString()}</span></div>
        <div className="flex justify-between text-gray"><span>Cashier</span><span>{receipt.cashier}</span></div>
        {receipt.customer && <div className="flex justify-between text-gray"><span>Customer</span><span>{receipt.customer}</span></div>}
      </div>

      <div className="border-t border-dashed border-line pt-3 space-y-2">
        {receipt.items.map((it, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-navy">{it.name} x{it.quantity}</span>
            <span className="text-navy tabular-nums">{ghs(it.subtotal)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-line pt-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray"><span>Subtotal</span><span className="tabular-nums">{ghs(receipt.subtotal)}</span></div>
        {receipt.discount > 0 && <div className="flex justify-between text-red"><span>Discount</span><span className="tabular-nums">-{ghs(receipt.discount)}</span></div>}
        {receipt.tax > 0 && <div className="flex justify-between text-gray"><span>Tax</span><span className="tabular-nums">{ghs(receipt.tax)}</span></div>}
        <div className="flex justify-between font-semibold text-navy pt-1"><span>Total</span><span className="tabular-nums">{ghs(receipt.total)}</span></div>
        <div className="border-t border-dashed border-line mt-2 pt-2 space-y-1">
          <div className="text-xs font-semibold text-navy uppercase tracking-wide">Payment</div>
          {receipt.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-gray">
              <span className="capitalize">{p.method.replace("_", " ")}</span>
              <span className="tabular-nums">{ghs(p.amount)}{p.reference ? ` (${p.reference})` : ""}</span>
            </div>
          ))}
        </div>
        {receipt.amountReceived != null && (
          <div className="flex justify-between text-gray"><span>Received</span><span className="tabular-nums">{ghs(receipt.amountReceived)}</span></div>
        )}
        {receipt.change != null && receipt.change > 0 && (
          <div className="flex justify-between font-medium text-blue-700"><span>Change</span><span className="tabular-nums">{ghs(receipt.change)}</span></div>
        )}
      </div>

      <div className="text-center text-xs text-gray-soft pt-2 border-t border-line">
        Thank you for your purchase!
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={handlePrint} className="flex-1">Print receipt</Button>
        <Button onClick={onClose} className="flex-1">Close</Button>
      </div>
    </Modal>
  );
}

function CreditCustomerModal({
  dueDate,
  onDueDateChange,
  selectedCustomerId,
  onSaved,
  onCancel,
}: {
  dueDate: string;
  onDueDateChange: (d: string) => void;
  selectedCustomerId?: string;
  onSaved: (customerId: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(selectedCustomerId ? "existing" : "new");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", ghanaCardNumber: "" });
  const [captureCard, setCaptureCard] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedCustomerId);

  const { data: customers, isFetching } = useQuery({
    queryKey: ["credit-customer-search", search],
    queryFn: async () => {
      const { data } = await (await import("../lib/apiClient")).api.get(
        `/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`
      );
      return data as { _id: string; name: string; phone: string; email?: string; outstandingBalance?: number; ghanaCardNumber?: string }[];
    },
    enabled: mode === "existing",
  });

  const { data: selectedCustomerFull } = useQuery({
    queryKey: ["customer-detail", selectedId],
    queryFn: () => getCustomer(selectedId!),
    enabled: Boolean(selectedId),
  });

  const cardOnFile = selectedCustomerFull?.ghanaCardNumber
    || customers?.find((c) => c._id === selectedId)?.ghanaCardNumber;

  async function handleSave() {
    setError("");
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Name and phone are required");
      return;
    }
    if (!form.ghanaCardNumber.trim()) {
      setError("Ghana Card number is required for credit sales");
      return;
    }
    setSaving(true);
    try {
      const { createCustomer } = await import("../api/customers");
      const customer = await createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        ghanaCardNumber: form.ghanaCardNumber.trim(),
      });
      onSaved(customer._id);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  async function handleUseExisting() {
    setError("");
    if (!selectedId) {
      setError("Select a customer to continue");
      return;
    }
    if (!cardOnFile && !captureCard.trim()) {
      setError("Ghana Card number is required for credit sales");
      return;
    }
    if (!cardOnFile) {
      setSaving(true);
      try {
        const { updateCustomer } = await import("../api/customers");
        await updateCustomer(selectedId, { ghanaCardNumber: captureCard.trim() });
      } catch (e) {
        const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
        setError(msg || "Failed to save Ghana Card number");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onSaved(selectedId);
  }

  const daysUntilDue = (() => {
    const diff = new Date(dueDate).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  })();

  return (
    <Modal open onClose={onCancel} title="Credit sale — customer details" size="md">
      <p className="text-sm text-gray mb-3">
        Credit sales require a registered customer with a Ghana Card on file. Enter details (or pick an existing
        customer) and set when payment is due.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setMode("new"); setError(""); }}
          className={`px-3 py-1.5 rounded-control text-xs font-medium transition ${mode === "new" ? "bg-blue-600 text-white" : "bg-paper text-gray hover:text-navy"}`}
        >
          New customer
        </button>
        <button
          type="button"
          onClick={() => { setMode("existing"); setError(""); }}
          className={`px-3 py-1.5 rounded-control text-xs font-medium transition ${mode === "existing" ? "bg-blue-600 text-white" : "bg-paper text-gray hover:text-navy"}`}
        >
          Existing customer
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray mb-1">Payment due date</span>
          <input
            type="date"
            value={dueDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
          <span className="block text-[11px] text-gray-soft mt-1">
            {daysUntilDue > 0
              ? `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} — reminders will notify managers before/after this date`
              : daysUntilDue === 0
                ? "Due today"
                : "Due date is in the past"}
          </span>
        </label>

        {mode === "new" ? (
          <>
            <label className="block">
              <span className="block text-xs font-medium text-gray mb-1">Full name *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ama Mensah"
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray mb-1">Phone *</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 0244-118-800"
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray mb-1">Ghana Card number *</span>
              <input
                value={form.ghanaCardNumber}
                onChange={(e) => setForm({ ...form, ghanaCardNumber: e.target.value })}
                placeholder="e.g. GHA-123456789-0"
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray mb-1">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="optional"
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray mb-1">Address</span>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="optional"
                className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </label>
          </>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <div className="max-h-48 overflow-y-auto border border-line rounded-control divide-y divide-line">
              {isFetching && <div className="px-3 py-3 text-xs text-gray-soft">Searching...</div>}
              {!isFetching && customers?.length === 0 && (
                <div className="px-3 py-3 text-xs text-gray-soft">No customers found</div>
              )}
                {customers?.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => { setSelectedId(c._id); setError(""); setCaptureCard(""); }}
                  className={`w-full text-left px-3 py-2 text-sm transition ${selectedId === c._id ? "bg-blue-50 text-blue-700" : "hover:bg-paper"}`}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-soft text-xs ml-2">{c.phone}</span>
                  {!!c.outstandingBalance && c.outstandingBalance > 0 && (
                    <span className="text-red text-xs float-right">owes GH₵ {c.outstandingBalance.toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
            {selectedId && (
              cardOnFile ? (
                <p className="text-xs text-gray-soft">
                  Ghana Card on file: <span className="text-navy font-medium font-mono">{cardOnFile}</span>
                </p>
              ) : (
                <label className="block">
                  <span className="block text-xs font-medium text-gray mb-1">Ghana Card number *</span>
                  <input
                    value={captureCard}
                    onChange={(e) => setCaptureCard(e.target.value)}
                    placeholder="e.g. GHA-123456789-0"
                    className="w-full px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  />
                  <span className="block text-[11px] text-gray-soft mt-1">
                    Required for credit sales — saved to this customer&apos;s profile
                  </span>
                </label>
              )
            )}
          </>
        )}

        {error && <p className="text-xs text-red" role="alert">{error}</p>}
      </div>

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button
          onClick={mode === "new" ? handleSave : handleUseExisting}
          disabled={saving}
          className="flex-1"
        >
          {saving ? "Saving..." : "Continue to payment"}
        </Button>
      </div>
    </Modal>
  );
}

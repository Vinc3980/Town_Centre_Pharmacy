import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Ban, Check, X, Download } from "lucide-react";
import { getSaleDetail, getSaleReceipt, voidSale, requestRefund } from "../api/sales";
import { useAuth } from "../context/AuthContext";
import { SaleDetail as SaleDetailType, SaleReturn, SaleReceipt } from "../types";
import Toast from "../components/ui/Toast";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canRefund = user?.permissions?.includes("process_refunds") ?? false;

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sale-detail", id],
    queryFn: () => getSaleDetail(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-sm text-ink-900/40 py-12 text-center">Loading sale…</div>;
  }

  if (!data) {
    return <div className="text-sm text-ink-900/40 py-12 text-center">Sale not found</div>;
  }

  const { sale, returns } = data;

  async function handleVoid() {
    if (!id) return;
    try {
      await voidSale(id);
      setShowVoidConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["sale-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["sales-list"] });
      setToast({ message: "Sale voided successfully", type: "success" });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to void sale";
      setToast({ message, type: "error" });
    }
  }

  async function handleDownloadReceipt() {
    if (!id) return;
    try {
      const receipt: SaleReceipt = await getSaleReceipt(id);
      const dateStr = new Date(receipt.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = new Date(receipt.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const itemsHtml = receipt.items.map((it) =>
        `<tr><td>${it.name}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${ghs(it.unitPrice)}</td>${it.discount > 0 ? `<td style="text-align:right;color:#C15626">-${ghs(it.discount)}</td>` : "<td></td>"}<td style="text-align:right;font-weight:600">${ghs(it.subtotal)}</td></tr>`
      ).join("");
      const paymentsHtml = receipt.payments.map((p) =>
        `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="text-transform:capitalize">${p.method.replace("_", " ")}</span><span>${ghs(p.amount)}${p.reference ? ` (${p.reference})` : ""}</span></div>`
      ).join("");

      const html = `<!DOCTYPE html>
<html><head><title>Receipt - ${receipt.receipt}</title>
<style>
  body { font-family: 'IBM Plex Sans', Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 16px; color: #0F1E1A; font-size: 13px; }
  .header { text-align: center; border-bottom: 2px solid #137056; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 18px; color: #137056; }
  .header p { margin: 2px 0 0; font-size: 11px; color: #99958A; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { text-align: left; font-size: 10px; color: #99958A; text-transform: uppercase; border-bottom: 1px solid #E6E3D6; padding: 4px 0; }
  td { padding: 5px 0; border-bottom: 1px solid #F2F0E8; font-size: 13px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .total { font-size: 16px; font-weight: 700; color: #137056; text-align: center; margin-top: 12px; padding-top: 10px; border-top: 2px solid #137056; }
  .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #99958A; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="header">
    ${receipt.logoUrl ? `<img src="${receipt.logoUrl}" style="max-height:40px;margin-bottom:4px" />` : ""}
    <h1>${receipt.name}</h1>
    <p>${receipt.address || ""}${receipt.phone ? ` · ${receipt.phone}` : ""}</p>
  </div>
  <div class="row"><span>Receipt</span><span style="font-weight:600">${receipt.receipt}</span></div>
  <div class="row"><span>Date</span><span>${dateStr} ${timeStr}</span></div>
  <div class="row"><span>Cashier</span><span>${receipt.cashier}</span></div>
  ${receipt.customer ? `<div class="row"><span>Customer</span><span>${receipt.customer}</span></div>` : ""}
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Disc</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="row"><span>Subtotal</span><span>${ghs(receipt.subtotal)}</span></div>
  ${receipt.discount > 0 ? `<div class="row" style="color:#C15626"><span>Discount</span><span>-${ghs(receipt.discount)}</span></div>` : ""}
  ${receipt.tax > 0 ? `<div class="row"><span>Tax</span><span>${ghs(receipt.tax)}</span></div>` : ""}
  <div class="total">Total: ${ghs(receipt.total)}</div>
  <div style="margin-top:12px"><strong>Payments</strong>${paymentsHtml}</div>
  ${receipt.amountReceived != null ? `<div class="row"><span>Received</span><span>${ghs(receipt.amountReceived)}</span></div>` : ""}
  ${receipt.change != null && receipt.change > 0 ? `<div class="row" style="color:#137056"><span>Change</span><span>${ghs(receipt.change)}</span></div>` : ""}
  ${receipt.status !== "completed" ? `<div class="row"><span>Status</span><span style="text-transform:capitalize">${receipt.status.replace(/_/g, " ")}</span></div>` : ""}
  <div class="footer">Thank you for choosing ${receipt.name}</div>
  <script>window.onload = function() { window.print(); }</script>
</body></html>`;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) w.onload = () => { w.print(); };
    } catch {
      setToast({ message: "Failed to load receipt", type: "error" });
    }
  }

  const canProcess = sale.status === "completed" || sale.status === "partially_refunded";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-ink-900/40 hover:text-ink-900/70">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-ink-900">{sale.transactionNumber}</h1>
          <p className="text-xs text-ink-900/40">{new Date(sale.createdAt).toLocaleString()}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {canProcess && (
            <button
              onClick={handleDownloadReceipt}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-sand-200 text-ink-900/70 hover:bg-sand-50 transition"
            >
              <Download size={14} /> Receipt
            </button>
          )}
          {canProcess && canRefund && (
            <button
              onClick={() => setShowRefundModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-clay-200 text-clay-600 hover:bg-clay-50 transition"
            >
              <RotateCcw size={14} /> Refund
            </button>
          )}
          {canProcess && canRefund && (
            <button
              onClick={() => setShowVoidConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition"
            >
              <Ban size={14} /> Void
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-sand-200 p-5 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-900/50">Status</span>
          <StatusBadge status={sale.status} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-900/50">Cashier</span>
          <span className="text-ink-900">{typeof sale.cashier === "object" ? sale.cashier.name : sale.cashier}</span>
        </div>
        {sale.customer && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-900/50">Customer</span>
            <span className="text-ink-900">{typeof sale.customer === "object" ? sale.customer.name : sale.customer}</span>
          </div>
        )}
        {sale.prescriptionReference && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-900/50">Prescription #</span>
            <span className="text-ink-900 font-mono">{sale.prescriptionReference}</span>
          </div>
        )}
        {sale.dispensedBy && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-900/50">Dispensed by</span>
            <span className="text-ink-900">{typeof sale.dispensedBy === "object" ? sale.dispensedBy.name : sale.dispensedBy}</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-sand-200 p-5">
        <h3 className="text-sm font-medium text-ink-900/70 mb-3">Items</h3>
        <div className="space-y-2">
          {sale.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-sand-100 last:border-0">
              <div>
                <span className="text-ink-900">{it.name}</span>
                <span className="text-ink-900/40 ml-2">x{it.quantity}</span>
                {it.discount > 0 && <span className="text-clay-600 ml-2">-{ghs(it.discount)}</span>}
              </div>
              <span className="text-ink-900 font-medium">{ghs(it.subtotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-sand-200 mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-ink-900/50"><span>Subtotal</span><span>{ghs(sale.subtotal)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between text-clay-600"><span>Discount</span><span>-{ghs(sale.discount)}</span></div>}
          {sale.tax > 0 && <div className="flex justify-between text-ink-900/50"><span>Tax</span><span>{ghs(sale.tax)}</span></div>}
          <div className="flex justify-between font-semibold text-ink-900 pt-1"><span>Total</span><span>{ghs(sale.total)}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-sand-200 p-5">
        <h3 className="text-sm font-medium text-ink-900/70 mb-3">Payments</h3>
        <div className="space-y-2">
          {sale.payments.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-ink-900 capitalize">{p.method.replace("_", " ")}</span>
              <span className="text-ink-900">{ghs(p.amount)}{p.reference ? ` (${p.reference})` : ""}</span>
            </div>
          ))}
        </div>
        {sale.amountReceived != null && (
          <div className="border-t border-sand-200 mt-2 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-ink-900/50"><span>Received</span><span>{ghs(sale.amountReceived)}</span></div>
            {sale.change != null && sale.change > 0 && <div className="flex justify-between text-pine-700"><span>Change</span><span>{ghs(sale.change)}</span></div>}
          </div>
        )}
      </div>

      {sale.refundedAmount != null && sale.refundedAmount > 0 && (
        <div className="bg-clay-50 rounded-xl border border-clay-200 p-5">
          <h3 className="text-sm font-medium text-clay-700 mb-2">Refund Summary</h3>
          <div className="text-sm text-clay-600">
            Refunded: {ghs(sale.refundedAmount)} of {ghs(sale.total)}
          </div>
        </div>
      )}

      {returns.length > 0 && (
        <div className="bg-white rounded-xl border border-sand-200 p-5">
          <h3 className="text-sm font-medium text-ink-900/70 mb-3">Return History</h3>
          <div className="space-y-3">
            {returns.map((r) => (
              <div key={r._id} className="border border-sand-100 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-900">{r.transactionNumber}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-ink-900/40">
                  {r.items.map((it) => `${it.returnQuantity}x ${it.name} (${it.condition})`).join(", ")} — {ghs(r.refundAmount)}
                </div>
                <div className="text-xs text-ink-900/30">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRefundModal && (
        <RefundModal
          sale={sale}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => {
            setShowRefundModal(false);
            queryClient.invalidateQueries({ queryKey: ["sale-detail", id] });
            queryClient.invalidateQueries({ queryKey: ["sales-list"] });
            setToast({ message: "Refund processed", type: "success" });
          }}
        />
      )}

      {showVoidConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-medium text-ink-900">Void this sale?</h3>
            <p className="text-sm text-ink-900/60">This will reverse all stock and mark the sale as voided. This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowVoidConfirm(false)} className="flex-1 py-2.5 rounded-lg text-sm border border-sand-200 text-ink-900/60 hover:bg-sand-50 transition">
                Cancel
              </button>
              <button onClick={handleVoid} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition">
                Void sale
              </button>
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-pine-100 text-pine-700",
    partially_refunded: "bg-amber-100 text-amber-700",
    refunded: "bg-clay-100 text-clay-700",
    voided: "bg-red-100 text-red-700",
    held: "bg-sand-200 text-ink-900/60",
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-pine-100 text-pine-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-sand-200 text-ink-900/60"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RefundModal({ sale, onClose, onSuccess }: { sale: SaleDetailType; onClose: () => void; onSuccess: () => void }) {
  const [items, setItems] = useState<{
    medicine: string; batch: string; name: string; maxQty: number; unitPrice: number;
    returnQuantity: number; condition: "resaleable" | "damaged"; reason: string;
  }[]>(
    sale.items.map((it) => ({
      medicine: it.medicine, batch: it.batch, name: it.name, maxQty: it.quantity, unitPrice: it.unitPrice,
      returnQuantity: 0, condition: "resaleable" as const, reason: "",
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = items.filter((it) => it.returnQuantity > 0);
  const totalRefund = selectedItems.reduce((s, it) => s + it.unitPrice * it.returnQuantity, 0);

  function updateItem(i: number, field: string, value: unknown) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  }

  async function handleSubmit() {
    if (selectedItems.length === 0) {
      setError("Select at least one item to return");
      return;
    }
    for (const it of selectedItems) {
      if (!it.reason.trim()) {
        setError(`Reason required for ${it.name}`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await requestRefund(
        sale._id,
        selectedItems.map((it) => ({
          medicine: it.medicine,
          batch: it.batch,
          returnQuantity: it.returnQuantity,
          condition: it.condition,
          reason: it.reason,
        }))
      );
      onSuccess();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Refund failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-ink-900">Refund items</h3>
          <button onClick={onClose} className="text-ink-900/30 hover:text-ink-900/60"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="border border-sand-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-900">{it.name}</span>
                <span className="text-ink-900/40">sold: {it.maxQty}</span>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0}
                  max={it.maxQty}
                  value={it.returnQuantity || ""}
                  onChange={(e) => updateItem(i, "returnQuantity", Math.max(0, Math.min(it.maxQty, Number(e.target.value))))}
                  placeholder="Qty"
                  className="w-20 px-2 py-1 rounded border border-sand-200 text-sm outline-none focus:border-pine-500"
                />
                <select
                  value={it.condition}
                  onChange={(e) => updateItem(i, "condition", e.target.value)}
                  className="px-2 py-1 rounded border border-sand-200 text-sm outline-none focus:border-pine-500"
                >
                  <option value="resaleable">Resaleable</option>
                  <option value="damaged">Damaged</option>
                </select>
                <input
                  value={it.reason}
                  onChange={(e) => updateItem(i, "reason", e.target.value)}
                  placeholder="Reason"
                  className="flex-1 px-2 py-1 rounded border border-sand-200 text-sm outline-none focus:border-pine-500"
                />
              </div>
            </div>
          ))}
        </div>

        {selectedItems.length > 0 && (
          <div className="border-t border-sand-200 pt-3 text-sm">
            <div className="flex justify-between font-medium text-ink-900">
              <span>Refund amount</span>
              <span>{ghs(totalRefund)}</span>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm border border-sand-200 text-ink-900/60 hover:bg-sand-50 transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedItems.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-pine-700 hover:bg-pine-800 disabled:opacity-40 transition"
          >
            {submitting ? "Processing…" : "Submit refund"}
          </button>
        </div>
      </div>
    </div>
  );
}

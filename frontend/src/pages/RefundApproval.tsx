import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, RotateCcw } from "lucide-react";
import { listPendingRefunds, approveRefund } from "../api/sales";
import { SaleReturn } from "../types";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Toast from "../components/ui/Toast";
import EmptyState from "../components/ui/EmptyState";
import { TableSkeleton } from "../components/ui/Skeleton";
import Input from "../components/ui/Input";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RefundApproval() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: refunds, isLoading } = useQuery({
    queryKey: ["pending-refunds"],
    queryFn: listPendingRefunds,
    refetchInterval: 10000,
  });

  async function handleApprove(id: string) {
    try {
      await approveRefund(id);
      queryClient.invalidateQueries({ queryKey: ["pending-refunds"] });
      setToast({ message: "Refund approved", type: "success" });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to approve";
      setToast({ message, type: "error" });
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    try {
      await approveRefund(id, { rejectionReason: rejectReason });
      queryClient.invalidateQueries({ queryKey: ["pending-refunds"] });
      setRejectingId(null);
      setRejectReason("");
      setToast({ message: "Refund rejected", type: "success" });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to reject";
      setToast({ message, type: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy">Pending Refunds</h1>

      <div className="bg-white rounded-card border border-line overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : !refunds || refunds.length === 0 ? (
          <EmptyState
            icon={<RotateCcw size={24} className="text-gray-soft" />}
            title="No pending refund requests"
            description="Refund requests requiring approval will appear here."
          />
        ) : (
          <div className="divide-y divide-line">
            {refunds.map((r: SaleReturn) => (
              <div key={r._id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-navy">{r.transactionNumber}</span>
                    <span className="text-gray ml-2 text-xs">
                      {typeof r.sale === "object" ? r.sale.transactionNumber : ""}
                    </span>
                  </div>
                  <span className="font-semibold text-blue-600 tabular-nums">{ghs(r.refundAmount)}</span>
                </div>

                <div className="text-xs text-gray">
                  {r.items.map((it) => `${it.returnQuantity}x ${it.name} (${it.condition}) — ${it.reason}`).join("; ")}
                </div>

                <div className="text-xs text-gray-soft">
                  Requested by {typeof r.requestedBy === "object" ? r.requestedBy.name : r.requestedBy} — {new Date(r.createdAt).toLocaleString()}
                </div>

                {rejectingId === r._id ? (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Rejection reason"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleReject(r._id)}
                      disabled={!rejectReason.trim()}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(r._id)}
                      icon={<Check size={14} />}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setRejectingId(r._id)}
                      icon={<X size={14} />}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

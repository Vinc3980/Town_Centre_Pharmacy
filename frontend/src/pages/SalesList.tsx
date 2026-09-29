import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listSales } from "../api/sales";
import { SaleDetail } from "../types";
import SearchInput from "../components/ui/SearchInput";
import Badge from "../components/ui/Badge";
import PageTabs from "../components/ui/PageTabs";
import { TableSkeleton } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { Receipt, ChevronLeft, ChevronRight } from "lucide-react";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TABS = [
  { label: "All sales", value: "" },
  { label: "Completed", value: "completed" },
  { label: "Partially refunded", value: "partially_refunded" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
  { label: "Held", value: "held" },
];

const STATUS_BADGE: Record<string, string> = {
  completed: "success",
  partially_refunded: "warning",
  refunded: "danger",
  voided: "danger",
  held: "sand",
};

const PAGE_SIZE = 15;

export default function SalesList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const s = searchParams.get("search");
    if (s) setSearch(s);
  }, [searchParams]);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales-list", search, status, from, to],
    queryFn: () => listSales({ search: search || undefined, status: status || undefined, from: from || undefined, to: to || undefined }),
  });

  const allSales = sales ?? [];
  const totalPages = Math.max(1, Math.ceil(allSales.length / PAGE_SIZE));
  const paginated = allSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const exactMatch = search.trim()
    ? allSales.find((s) => s.transactionNumber.toLowerCase() === search.trim().toLowerCase())
    : undefined;

  return (
    <div className="space-y-0">
      <PageTabs tabs={TABS} activeTab={status} onChange={(v) => { setStatus(v); setPage(1); }} />

      <div className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-navy">Sales</h1>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 p-3 bg-white rounded-card border border-line flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search receipt # e.g. INV-20260922-0004"
            />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            aria-label="From date"
            className="px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            aria-label="To date"
            className="px-3 py-2 rounded-control border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
        </div>

        {/* Exact receipt match highlight */}
        {exactMatch && (
          <button
            onClick={() => navigate(`/sales/${exactMatch._id}`)}
            className="w-full text-left bg-blue-50 border border-blue-100 rounded-card px-4 py-3 flex items-center justify-between hover:border-blue-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-blue-700 font-semibold mb-0.5">Receipt found</div>
              <div className="text-sm font-medium text-navy font-mono">{exactMatch.transactionNumber}</div>
              <div className="text-xs text-gray mt-0.5">
                {new Date(exactMatch.createdAt).toLocaleString()} · {ghs(exactMatch.total)} · {exactMatch.items.length} item(s)
                {typeof exactMatch.cashier === "object" ? ` · ${exactMatch.cashier.name}` : ""}
              </div>
            </div>
            <Badge variant={STATUS_BADGE[exactMatch.status] ?? "sand"}>{exactMatch.status.replace(/_/g, " ")}</Badge>
          </button>
        )}

        {/* Table */}
        <div className="bg-white rounded-card border border-line overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : allSales.length === 0 ? (
            <EmptyState
              icon={<Receipt size={24} className="text-gray-soft" />}
              title="No sales found"
              description="Sales will appear here once transactions are processed."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Transaction</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden sm:table-cell" scope="col">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden md:table-cell" scope="col">Cashier</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray hidden lg:table-cell" scope="col">Items</th>
                      <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Total</th>
                      <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray" scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paginated.map((s: SaleDetail) => (
                      <tr
                        key={s._id}
                        onClick={() => navigate(`/sales/${s._id}`)}
                        className="hover:bg-paper cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30"
                        tabIndex={0}
                        role="row"
                        onKeyDown={(e) => { if (e.key === "Enter") navigate(`/sales/${s._id}`); }}
                      >
                        <td className="px-4 py-3 font-medium text-navy">{s.transactionNumber}</td>
                        <td className="px-4 py-3 text-gray hidden sm:table-cell">{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-gray hidden md:table-cell">{typeof s.cashier === "object" ? s.cashier.name : ""}</td>
                        <td className="px-4 py-3 text-gray hidden lg:table-cell">{s.items.length}</td>
                        <td className="px-4 py-3 text-right font-medium text-navy tabular-nums">{ghs(s.total)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[s.status] ?? "sand"}>
                            {s.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
    </div>
  );
}

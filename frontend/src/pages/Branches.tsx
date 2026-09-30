import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Phone, UserCog, ReceiptText, Users, Clock } from "lucide-react";
import { fetchBranches, createBranch, fetchBranchDaily, Branch } from "../api/branches";
import { fetchUsers, updateUser } from "../api/users";
import { fetchRecentActivity, fetchStaffPerformance } from "../api/audit";
import { User, AuditEntry, StaffPerformance } from "../types";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Toast from "../components/ui/Toast";
import EmptyState from "../components/ui/EmptyState";
import { CardSkeleton } from "../components/ui/Skeleton";

function ghs(n: number) {
  return `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

const ROLE_BADGES: Record<string, string> = {
  admin: "bg-amber-100 text-amber-700",
  branch_manager: "bg-blue-100 text-blue-700",
  staff: "bg-purple-100 text-purple-700",
};

function activityUserId(entry: AuditEntry): string | null {
  const u = entry.user;
  if (!u || typeof u === "string") return u ?? null;
  return (u as { _id?: string; id?: string }).id ?? (u as { _id?: string })._id ?? null;
}

export default function Branches() {
  const qc = useQueryClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [addOpen, setAddOpen] = useState(false);
  const [dailyBranch, setDailyBranch] = useState<Branch | null>(null);
  const [dailyDate, setDailyDate] = useState(todayISO);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", managerId: "" });

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const performanceQuery = useQuery({
    queryKey: ["staff-performance-today"],
    queryFn: () => fetchStaffPerformance({ from: todayISO }),
  });
  const activityQuery = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => fetchRecentActivity(200),
  });

  const dailyQuery = useQuery({
    queryKey: ["branch-daily", dailyBranch?.id, dailyDate],
    queryFn: () => fetchBranchDaily(dailyBranch!.id, dailyDate),
    enabled: !!dailyBranch,
  });

  const createMutation = useMutation({
    mutationFn: createBranch,
    onSuccess: (branch) => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      setAddOpen(false);
      setForm({ name: "", code: "", address: "", phone: "", managerId: "" });
      setToast({ message: `Branch "${branch.name}" created`, type: "success" });
    },
    onError: (err: Error) => setToast({ message: err.message || "Failed to create branch", type: "error" }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, branch }: { id: string; branch: string }) => updateUser(id, { branch }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      setToast({ message: `Staff assigned to ${vars.branch}`, type: "success" });
    },
    onError: (err: Error) => setToast({ message: err.message || "Failed to assign staff", type: "error" }),
  });

  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const staffUsers = useMemo(() => users.filter((u) => u.role !== "admin" || u.branch !== "Main Branch"), [users]);

  const perfByUser = useMemo(() => {
    const map = new Map<string, StaffPerformance>();
    (performanceQuery.data ?? []).forEach((p) => map.set(p.user, p));
    return map;
  }, [performanceQuery.data]);

  const latestActivityByUser = useMemo(() => {
    const map = new Map<string, AuditEntry>();
    for (const entry of activityQuery.data ?? []) {
      const uid = activityUserId(entry);
      if (uid && !map.has(uid)) map.set(uid, entry);
    }
    return map;
  }, [activityQuery.data]);

  const branchNameOptions = useMemo(() => {
    const names = new Set<string>(["Main Branch"]);
    branches.forEach((b) => names.add(b.name));
    users.forEach((u) => u.branch && names.add(u.branch));
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [branches, users]);

  const managerOptions = useMemo(
    () =>
      users
        .filter((u) => u.role === "branch_manager" || u.role === "admin")
        .map((u) => ({ value: u.id, label: `${u.name} (${u.role.replace("_", " ")})` })),
    [users]
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      name: form.name.trim(),
      code: form.code.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      managerId: form.managerId || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Branches</h1>
          <p className="text-sm text-ink-900/45 mt-1">
            Add branches, assign staff, and monitor daily transactions per branch
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} />
          Add Branch
        </Button>
      </div>

      {branchesQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <EmptyState
          icon={<Building2 size={24} className="text-gray-soft" />}
          title="No branches yet"
          description="Create your first branch to start tracking staff and daily transactions by location."
          action={<Button onClick={() => setAddOpen(true)}>Add Branch</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-white border border-line rounded-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-navy">{b.name}</div>
                  <Badge className="bg-blue-50 text-blue-600 mt-1">{b.code}</Badge>
                </div>
                <Badge className={b.status === "active" ? "bg-green-100 text-green" : "bg-gray-100 text-gray"}>
                  {b.status}
                </Badge>
              </div>

              <div className="space-y-1.5 text-sm text-ink-900/70">
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-soft" />
                  <span>{b.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="flex-shrink-0 text-gray-soft" />
                  <span>{b.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCog size={14} className="flex-shrink-0 text-gray-soft" />
                  <span>{b.manager ? `Manager: ${b.manager.name}` : "No manager assigned"}</span>
                </div>
              </div>

              <div className="bg-content-bg rounded-control p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-soft flex items-center gap-1">
                    <ReceiptText size={12} /> Today
                  </div>
                  <div className="text-lg font-bold text-navy">{ghs(b.today.revenue)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-soft">Transactions</div>
                  <div className="text-lg font-bold text-blue-600">{b.today.salesCount}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-soft mb-1.5 flex items-center gap-1">
                  <Users size={12} /> Staff assigned ({b.staff.length})
                </div>
                {b.staff.length === 0 ? (
                  <p className="text-xs text-ink-900/40">No staff assigned yet</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {b.staff.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-pill bg-paper text-xs text-navy border border-line"
                        title={s.email}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setDailyDate(todayISO);
                  setDailyBranch(b);
                }}
              >
                <Clock size={14} />
                View today's transactions
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Staff across all branches */}
      <div className="bg-white border border-line rounded-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="font-bold text-navy flex items-center gap-2">
            <Users size={16} /> Staff across all branches
          </h3>
          <p className="text-xs text-ink-900/45 mt-0.5">Assign staff to a branch and see their activity</p>
        </div>
        {usersQuery.isLoading ? (
          <div className="p-5"><CardSkeleton /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-900/60 border-b border-line bg-paper/50">
                  <th className="px-5 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Today's sales</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((u: User) => {
                  const perf = perfByUser.get(u.id);
                  const activity = latestActivityByUser.get(u.id);
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-paper/40">
                      <td className="px-5 py-3">
                        <div className="font-medium text-navy">{u.name}</div>
                        <div className="text-xs text-ink-900/45">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={ROLE_BADGES[u.role] ?? "bg-gray-100 text-gray"}>
                          {u.role.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 min-w-[170px]">
                        <Select
                          aria-label={`Branch for ${u.name}`}
                          options={branchNameOptions}
                          value={u.branch ?? "Main Branch"}
                          onChange={(e) =>
                            assignMutation.mutate({ id: u.id, branch: e.target.value })
                          }
                          className="py-1.5"
                        />
                      </td>
                      <td className="px-4 py-3 text-ink-900/70 whitespace-nowrap">{fmtDate(u.lastLoginAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {perf ? (
                          <span className="text-navy">
                            <span className="font-bold">{perf.salesCount}</span>
                            <span className="text-ink-900/45"> · {ghs(perf.salesValue)}</span>
                          </span>
                        ) : (
                          <span className="text-ink-900/40">0 · {ghs(0)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        {activity ? (
                          <div className="text-xs">
                            <div className="text-ink-900/70 truncate" title={activity.description}>
                              {activity.description}
                            </div>
                            <div className="text-ink-900/40">{fmtTime(activity.createdAt)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-900/40">No recent activity</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add branch modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Branch">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Branch name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Tema Branch"
            />
            <Input
              label="Branch code"
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. TM-01"
            />
          </div>
          <Input
            label="Address"
            required
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Street, city"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone"
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 030 200 0000"
            />
            <Select
              label="Manager (optional)"
              options={managerOptions}
              placeholder="No manager"
              value={form.managerId}
              onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create branch
            </Button>
          </div>
        </form>
      </Modal>

      {/* Daily transactions modal */}
      <Modal
        open={!!dailyBranch}
        onClose={() => setDailyBranch(null)}
        title={dailyBranch ? `${dailyBranch.name} — Daily transactions` : ""}
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Input
              label="Date"
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="w-44"
            />
            {dailyQuery.data && (
              <div className="text-right">
                <div className="text-xs text-gray-soft">Total</div>
                <div className="font-bold text-navy">
                  {ghs(dailyQuery.data.summary.revenue)}{" "}
                  <span className="text-sm font-medium text-ink-900/45">
                    · {dailyQuery.data.summary.salesCount} txns
                  </span>
                </div>
              </div>
            )}
          </div>

          {dailyQuery.isLoading ? (
            <CardSkeleton />
          ) : (dailyQuery.data?.sales.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-900/45 py-6 text-center">No transactions on this date</p>
          ) : (
            <div className="overflow-x-auto border border-line rounded-control">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-900/60 border-b border-line bg-paper/50">
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Transaction</th>
                    <th className="px-4 py-2.5 font-medium">Cashier</th>
                    <th className="px-4 py-2.5 font-medium">Payment</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyQuery.data!.sales.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-ink-900/70 whitespace-nowrap">{fmtTime(s.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium text-navy">{s.transactionNumber}</td>
                      <td className="px-4 py-2.5 text-ink-900/70">{s.cashier?.name ?? "-"}</td>
                      <td className="px-4 py-2.5 text-ink-900/70 capitalize">{s.paymentMethod.replace("_", " ")}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-navy whitespace-nowrap">{ghs(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

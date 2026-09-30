import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit2, Trash2, Key, UserCheck, UserX, Shield, Camera } from "lucide-react";
import { fetchUsers, createUser, updateUser, deactivateUser, reactivateUser, adminResetPassword, uploadStaffImage, CreateUserPayload, UpdateUserPayload } from "../api/users";
import { fetchBranches } from "../api/branches";
import { User } from "../types";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Toast from "../components/ui/Toast";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { CardSkeleton } from "../components/ui/Skeleton";

const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "admin", label: "Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  staff: "bg-purple-100 text-purple-700",
  branch_manager: "bg-blue-100 text-blue-700",
  admin: "bg-amber-100 text-amber-700",
};

const AVAILABLE_PERMISSIONS = [
  { value: "view_dashboard", label: "View Dashboard" },
  { value: "process_sales", label: "Process Sales & Customers" },
  { value: "view_reports", label: "View Reports & Exports" },
  { value: "manage_medicines", label: "Manage Products" },
  { value: "manage_inventory", label: "Manage Inventory" },
  { value: "process_refunds", label: "Process Refunds" },
  { value: "manage_suppliers", label: "Manage Suppliers" },
  { value: "manage_expenses", label: "Manage Expenses" },
  { value: "manage_prescriptions", label: "Manage Prescriptions" },
  { value: "apply_discounts", label: "Apply Discounts" },
  { value: "modify_prices", label: "Modify Prices" },
  { value: "perform_stock_adjustment", label: "Stock Adjustment" },
  { value: "view_audit_logs", label: "View Audit Logs" },
  { value: "manage_users", label: "Manage Users" },
  { value: "manage_settings", label: "Manage Settings" },
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  staff: [],
  branch_manager: AVAILABLE_PERMISSIONS.map((p) => p.value),
  admin: AVAILABLE_PERMISSIONS.map((p) => p.value),
};

const REMINDER_OPTIONS = [
  { value: "7", label: "Every 7 days" },
  { value: "15", label: "Every 15 days" },
  { value: "30", label: "Every 30 days" },
  { value: "60", label: "Every 60 days" },
  { value: "90", label: "Every 90 days" },
];

function UserForm({ initial, onSubmit, onCancel, loading }: {
  initial?: User;
  onSubmit: (data: CreateUserPayload | UpdateUserPayload) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    password: "",
    role: initial?.role ?? "staff",
    branch: initial?.branch ?? "Main Branch",
    phone: initial?.phone ?? "",
    salary: initial?.salary?.toString() ?? "",
    salaryStartDate: initial?.salaryStartDate ? initial.salaryStartDate.split("T")[0] : "",
    salaryReminderDays: initial?.salaryReminderDays?.toString() ?? "",
    dateOfBirth: initial?.dateOfBirth ? initial.dateOfBirth.split("T")[0] : "",
    gender: initial?.gender ?? "",
    address: initial?.address ?? "",
    emergencyContactName: initial?.emergencyContactName ?? "",
    emergencyContactPhone: initial?.emergencyContactPhone ?? "",
    emergencyContactRelation: initial?.emergencyContactRelation ?? "",
    nationalId: initial?.nationalId ?? "",
    employmentDate: initial?.employmentDate ? initial.employmentDate.split("T")[0] : "",
  });
  const [permissions, setPermissions] = useState<string[]>(initial?.permissions ?? []);
  const branchOptions = (() => {
    const names = new Set<string>(["Main Branch"]);
    (branchesQuery.data ?? []).forEach((b) => names.add(b.name));
    if (form.branch) names.add(form.branch);
    return Array.from(names).map((n) => ({ value: n, label: n }));
  })();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initial?.profilePicture ?? null);

  useEffect(() => {
    if (!initial) {
      setPermissions(DEFAULT_ROLE_PERMISSIONS[form.role] ?? []);
    }
  }, [form.role]);

  const isEdit = !!initial;
  const canSubmit = form.name && form.email && (isEdit || form.password) && form.role;

  function togglePermission(perm: string) {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  async function handleImageUpload() {
    if (!imageFile || !initial) return;
    try {
      const result = await uploadStaffImage(getUser(initial), imageFile);
      setImagePreview(result.profilePicture);
      setImageFile(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch {
      // silent
    }
  }

  function handleSubmit() {
    const payload: any = {};
    if (form.name) payload.name = form.name;
    if (form.email) payload.email = form.email;
    if (form.role) payload.role = form.role;
    if (form.branch) payload.branch = form.branch;
    if (form.phone) payload.phone = form.phone;
    if (!isEdit && form.password) payload.password = form.password;
    payload.permissions = permissions;
    if (form.salary) {
      payload.salary = parseFloat(form.salary);
    }
    if (form.salaryStartDate) {
      payload.salaryStartDate = form.salaryStartDate;
    }
    if (form.salaryReminderDays) {
      payload.salaryReminderDays = parseInt(form.salaryReminderDays, 10);
    }
    if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
    if (form.gender) payload.gender = form.gender;
    if (form.address) payload.address = form.address;
    if (form.emergencyContactName) payload.emergencyContactName = form.emergencyContactName;
    if (form.emergencyContactPhone) payload.emergencyContactPhone = form.emergencyContactPhone;
    if (form.emergencyContactRelation) payload.emergencyContactRelation = form.emergencyContactRelation;
    if (form.nationalId) payload.nationalId = form.nationalId;
    if (form.employmentDate) payload.employmentDate = form.employmentDate;
    onSubmit(payload);
  }

  const GENDER_OPTIONS = [
    { value: "", label: "Select gender" },
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" },
    { value: "Other", label: "Other" },
  ];

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {isEdit && (
        <div className="border border-sand-200 rounded-lg p-4">
          <div className="text-sm font-medium text-ink-900/70 mb-3">Employee Photo</div>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-20 h-20 rounded-full bg-sand-100 flex items-center justify-center overflow-hidden border-2 border-sand-200">
                {imagePreview ? (
                  <img src={imagePreview} alt={form.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-medium text-ink-900/30">{form.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center cursor-pointer hover:bg-orange-600 transition">
                <Camera size={12} className="text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
                }} />
              </label>
            </div>
            {imageFile && (
              <Button variant="secondary" onClick={handleImageUpload} className="text-xs py-1 px-3">Upload Photo</Button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Doe" />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. john@towncentrepharmacy.gh" />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0244-118-800" />
        <Select label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} options={branchOptions} />
        <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLE_OPTIONS} />
        {!isEdit && (
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Minimum 6 characters" />
        )}
      </div>

      <div className="border border-sand-200 rounded-lg p-4">
        <div className="text-sm font-medium text-ink-900/70 mb-3">Personal Information</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={GENDER_OPTIONS} />
          <Input label="National ID" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} placeholder="e.g. Ghana Card No." />
          <Input label="Employment Date" type="date" value={form.employmentDate} onChange={(e) => setForm({ ...form, employmentDate: e.target.value })} />
          <div className="md:col-span-2">
            <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. 123 Accra Road" />
          </div>
        </div>
      </div>

      <div className="border border-sand-200 rounded-lg p-4">
        <div className="text-sm font-medium text-ink-900/70 mb-3">Emergency Contact</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Contact Name" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="e.g. Jane Doe" />
          <Input label="Contact Phone" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} placeholder="e.g. 0244-118-800" />
          <Input label="Relationship" value={form.emergencyContactRelation} onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse" />
        </div>
      </div>

      <div className="border border-sand-200 rounded-lg p-4">
        <div className="text-sm font-medium text-ink-900/70 mb-3">Salary & Reminders</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Monthly Salary (GH₵)"
            type="number"
            step="0.01"
            value={form.salary}
            onChange={(e) => setForm({ ...form, salary: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Salary Start Date"
            type="date"
            value={form.salaryStartDate}
            onChange={(e) => setForm({ ...form, salaryStartDate: e.target.value })}
          />
          <Select
            label="Payment Reminder"
            value={form.salaryReminderDays}
            onChange={(e) => setForm({ ...form, salaryReminderDays: e.target.value })}
            options={[{ value: "", label: "No reminder" }, ...REMINDER_OPTIONS]}
          />
        </div>
      </div>
      <div className="border border-sand-200 rounded-lg p-4">
        <div className="text-sm font-medium text-ink-900/70 mb-3">Permissions</div>
        <p className="text-xs text-ink-900/40 mb-3">
          {form.role === "staff" ? "Select which permissions this staff member has." : `Default permissions for ${form.role.replace("_", " ")} are pre-selected. Customize as needed.`}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {AVAILABLE_PERMISSIONS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-xs text-ink-900/70 cursor-pointer hover:text-ink-900">
              <input
                type="checkbox"
                checked={permissions.includes(p.value)}
                onChange={() => togglePermission(p.value)}
                className="rounded border-sand-300 text-pine-600 focus:ring-pine-500"
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit}>
          {isEdit ? "Save Changes" : "Create User"}
        </Button>
      </div>
    </div>
  );
}

function PasswordResetForm({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const resetMutation = useMutation({
    mutationFn: () => adminResetPassword(userId, newPassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setToast({ message: `Password reset for ${userName}`, type: "success" });
      setTimeout(onClose, 1500);
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Reset failed", type: "error" }),
  });

  const passwordsMatch = newPassword === confirmPassword;
  const canReset = newPassword.length >= 6 && passwordsMatch;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-900/60">Set a new password for <strong>{userName}</strong></p>
      <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint="Minimum 6 characters" />
      <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => resetMutation.mutate()} loading={resetMutation.isPending} disabled={!canReset}>
          Reset Password
        </Button>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function getUser(u: User) { return u.id ?? (u as any)._id; }

export default function UserManagement() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<User | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setToast({ message: "User created successfully", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Creation failed", type: "error" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) => updateUser(id, data),
    onSuccess: (updatedUser) => {
      qc.setQueryData<User[]>(["users"], (old) =>
        old?.map((u) => (getUser(u) === updatedUser.id ? updatedUser : u)) ?? old
      );
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      setToast({ message: "User updated successfully", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeactivateTarget(null);
      setToast({ message: "User deactivated", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Deactivation failed", type: "error" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setReactivateTarget(null);
      setToast({ message: "User reactivated", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Reactivation failed", type: "error" }),
  });

  const filtered = users?.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase()) ||
    (u.staffId ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">User Management</h1>
          <p className="text-ink-900/50 text-sm mt-1">{users?.length ?? 0} staff members</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>Add User</Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-900/30" />
        <input
          type="text"
          placeholder="Search by name, email, role, or staff ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
        />
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No users found" description={search ? "Try a different search term" : "Add your first staff member"} />
      ) : (
        <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50/50">
                  <th className="text-left px-4 py-3 font-medium text-ink-900/60">Staff</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-900/60">Staff ID</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-900/60">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-900/60">Branch</th>
                  <th className="text-right px-4 py-3 font-medium text-ink-900/60">Salary</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-900/60">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-ink-900/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {filtered.map((u) => (
                  <tr key={getUser(u)} className="hover:bg-sand-50/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.profilePicture ? (
                          <img src={u.profilePicture} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-pine-700/60 text-white flex items-center justify-center text-xs font-medium">
                            {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-ink-900">{u.name}</div>
                          <div className="text-ink-900/40 text-xs">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-900/60">{u.staffId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-900/60">{u.branch ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-ink-900/60 tabular-nums">
                      {u.salary ? `GH₵ ${u.salary.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive === false ? (
                        <Badge variant="red">Inactive</Badge>
                      ) : (
                        <Badge variant="pine">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditUser(u)} className="p-1.5 rounded-lg text-ink-900/40 hover:text-pine-700 hover:bg-pine-50 transition" title="Edit">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setResetUser(u)} className="p-1.5 rounded-lg text-ink-900/40 hover:text-amber-600 hover:bg-amber-50 transition" title="Reset password">
                          <Key size={15} />
                        </button>
                        {u.isActive === false ? (
                          <button onClick={() => setReactivateTarget(u)} className="p-1.5 rounded-lg text-ink-900/40 hover:text-pine-700 hover:bg-pine-50 transition" title="Reactivate">
                            <UserCheck size={15} />
                          </button>
                        ) : (
                          <button onClick={() => setDeactivateTarget(u)} className="p-1.5 rounded-lg text-ink-900/40 hover:text-red-600 hover:bg-red-50 transition" title="Deactivate">
                            <UserX size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add New User" size="lg">
        <UserForm onSubmit={(data) => createMutation.mutate(data as CreateUserPayload)} onCancel={() => setShowCreate(false)} loading={createMutation.isPending} />
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User" size="lg">
        {editUser && (
          <UserForm
            initial={editUser}
            onSubmit={(data) => updateMutation.mutate({ id: getUser(editUser), data: data as UpdateUserPayload })}
            onCancel={() => setEditUser(null)}
            loading={updateMutation.isPending}
          />
        )}
      </Modal>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title="Reset Password">
        {resetUser && (
          <PasswordResetForm userId={getUser(resetUser)} userName={resetUser.name} onClose={() => setResetUser(null)} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivateTarget}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && deactivateMutation.mutate(getUser(deactivateTarget))}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deactivateTarget?.name}? They will not be able to log in.`}
        confirmLabel="Deactivate"
      />

      <ConfirmDialog
        open={!!reactivateTarget}
        onCancel={() => setReactivateTarget(null)}
        onConfirm={() => reactivateTarget && reactivateMutation.mutate(getUser(reactivateTarget))}
        title="Reactivate User"
        message={`Reactivate ${reactivateTarget?.name}? They will be able to log in again.`}
        confirmLabel="Reactivate"
        variant="primary"
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

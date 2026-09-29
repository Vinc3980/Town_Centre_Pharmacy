import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Store, Package, DollarSign, Shield, User, Eye, EyeOff, Camera,
  ChevronDown, Settings as SettingsIcon, Palette, CreditCard, Globe,
  Bell, Lock, FileText, Printer, MessageSquare, Mail, Smartphone,
  Key, Cookie, Wallet, Receipt, Landmark, LogOut,
} from "lucide-react";
import {
  fetchAllSettings, updatePharmacyInfo, updateInventorySettings, updateSalesSettings,
  updateSecuritySettings, fetchProfile, updateProfile, changePassword,
  uploadPharmacyLogo, removePharmacyLogo,
  PharmacyInfo, InventorySettings, SalesSettings, SecuritySettings, UserProfile,
} from "../api/settings";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Toast from "../components/ui/Toast";
import { CardSkeleton } from "../components/ui/Skeleton";
import { api } from "../lib/apiClient";

interface SettingsSection {
  title: string;
  items: { key: string; label: string; icon: React.ElementType }[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: "General Settings",
    items: [
      { key: "pharmacy", label: "Pharmacy", icon: Store },
      { key: "security", label: "Security", icon: Lock },
      { key: "profile", label: "My Profile", icon: User },
    ],
  },
  {
    title: "App Settings",
    items: [
      { key: "inventory", label: "Inventory", icon: Package },
      { key: "sales", label: "Sales & Tax", icon: DollarSign },
    ],
  },
];

type SettingsKey = string;

function PharmacyField({
  label, field, form, setForm, type = "text",
}: {
  label: string;
  field: keyof PharmacyInfo;
  form: PharmacyInfo;
  setForm: React.Dispatch<React.SetStateAction<PharmacyInfo>>;
  type?: string;
}) {
  return (
    <Input
      label={label}
      type={type}
      value={(form[field] as string) ?? ""}
      onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
    />
  );
}

function PharmacyTab({ data }: { data: PharmacyInfo }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(data);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(data.logoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [newPayment, setNewPayment] = useState("");

  useEffect(() => { setForm(data); setLogoPreview(data.logoUrl ?? null); }, [data]);

  const mutation = useMutation({
    mutationFn: updatePharmacyInfo,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setToast({ message: "Pharmacy info updated", type: "success" }); },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setUploadingLogo(true);
    try {
      const result = await uploadPharmacyLogo(logoFile);
      setLogoPreview(result.logoUrl);
      setLogoFile(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
      setToast({ message: "Logo uploaded", type: "success" });
    } catch {
      setToast({ message: "Logo upload failed", type: "error" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    try {
      await removePharmacyLogo();
      setLogoPreview(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
      setToast({ message: "Logo removed", type: "success" });
    } catch {
      setToast({ message: "Failed to remove logo", type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-lg text-ink-900">Pharmacy Information</h3>
        <p className="text-sm text-ink-900/45 mt-1">Update your pharmacy details and preferences</p>
      </div>

      <div className="border border-sand-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-ink-900/70 mb-3">Store Logo</label>
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-xl bg-sand-100 flex items-center justify-center overflow-hidden border border-sand-200">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Store size={28} className="text-ink-900/20" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }
              }}
              className="block w-full text-sm text-ink-900/50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-600 hover:file:bg-orange-100"
            />
            <div className="flex gap-2">
              {logoFile && (
                <Button variant="secondary" onClick={handleLogoUpload} loading={uploadingLogo} className="text-xs py-1 px-3">
                  Upload
                </Button>
              )}
              {logoPreview && (
                <Button variant="secondary" onClick={handleLogoRemove} className="text-xs py-1 px-3 text-clay-600">
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PharmacyField label="Pharmacy Name" field="name" form={form} setForm={setForm} />
        <PharmacyField label="Registration Number" field="registrationNumber" form={form} setForm={setForm} />
        <PharmacyField label="Phone" field="phone" form={form} setForm={setForm} />
        <PharmacyField label="Email" field="email" form={form} setForm={setForm} type="email" />
        <PharmacyField label="Address" field="address" form={form} setForm={setForm} />
        <PharmacyField label="City" field="city" form={form} setForm={setForm} />
        <PharmacyField label="Region" field="region" form={form} setForm={setForm} />
        <PharmacyField label="Country" field="country" form={form} setForm={setForm} />
        <PharmacyField label="Currency" field="currency" form={form} setForm={setForm} />
        <PharmacyField label="Timezone" field="timezone" form={form} setForm={setForm} />
      </div>

      <div className="border border-sand-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-ink-900/70 mb-3">Branches / Warehouse Names</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {(form.branches ?? []).map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pine-50 text-pine-700 text-xs font-medium">
              {b}
              <button type="button" onClick={() => setForm({ ...form, branches: (form.branches ?? []).filter((_, j) => j !== i) })} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="Add branch name..." className="flex-1 rounded-lg border border-sand-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 transition" />
          <Button variant="secondary" onClick={() => { if (newBranch.trim()) { setForm({ ...form, branches: [...(form.branches ?? []), newBranch.trim()] }); setNewBranch(""); } }}>Add</Button>
        </div>
      </div>

      <div className="border border-sand-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-ink-900/70 mb-3">Payment Options</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {(form.paymentMethods ?? []).map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
              {p}
              <button type="button" onClick={() => setForm({ ...form, paymentMethods: (form.paymentMethods ?? []).filter((_, j) => j !== i) })} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newPayment} onChange={(e) => setNewPayment(e.target.value)} placeholder="Add payment option..." className="flex-1 rounded-lg border border-sand-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 transition" />
          <Button variant="secondary" onClick={() => { if (newPayment.trim()) { setForm({ ...form, paymentMethods: [...(form.paymentMethods ?? []), newPayment.trim()] }); setNewPayment(""); } }}>Add</Button>
        </div>
      </div>

      <Button onClick={() => mutation.mutate(form)} loading={mutation.isPending}>
        Save Changes
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function InventoryTab({ data }: { data: InventorySettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(data);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: updateInventorySettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setToast({ message: "Inventory settings updated", type: "success" }); },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-lg text-ink-900">Inventory Settings</h3>
        <p className="text-sm text-ink-900/45 mt-1">Configure inventory management preferences</p>
      </div>
      <div className="space-y-4">
        <Input
          label="Low Stock Threshold"
          type="number"
          value={String(form.lowStockThreshold)}
          onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
          hint="Alert when stock falls below this level"
        />
        <Input
          label="Expiry Warning Days"
          type="number"
          value={String(form.expiryWarningDays)}
          onChange={(e) => setForm({ ...form, expiryWarningDays: Number(e.target.value) })}
          hint="Warn when product expires within this many days"
        />
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={form.allowNegativeStock}
            onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
            className="rounded border-sand-300 text-orange-500 focus:ring-orange-500 w-4 h-4" />
          Allow negative stock (out-of-sale override)
        </label>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={form.requireManagerApprovalForStockAdjustment}
            onChange={(e) => setForm({ ...form, requireManagerApprovalForStockAdjustment: e.target.checked })}
            className="rounded border-sand-300 text-orange-500 focus:ring-orange-500 w-4 h-4" />
          Require manager approval for stock adjustments
        </label>
      </div>
      <Button onClick={() => mutation.mutate(form)} loading={mutation.isPending}>
        Save Changes
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function SalesTab({ data }: { data: SalesSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(data);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: updateSalesSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setToast({ message: "Sales settings updated", type: "success" }); },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-lg text-ink-900">Sales & Tax Settings</h3>
        <p className="text-sm text-ink-900/45 mt-1">Configure sales and tax preferences</p>
      </div>
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={form.requireManagerApprovalForRefund}
            onChange={(e) => setForm({ ...form, requireManagerApprovalForRefund: e.target.checked })}
            className="rounded border-sand-300 text-orange-500 focus:ring-orange-500 w-4 h-4" />
          Require manager approval for refunds
        </label>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={form.discountAuthorizationRequired}
            onChange={(e) => setForm({ ...form, discountAuthorizationRequired: e.target.checked })}
            className="rounded border-sand-300 text-orange-500 focus:ring-orange-500 w-4 h-4" />
          Require authorization for discounts
        </label>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={form.taxEnabled}
            onChange={(e) => setForm({ ...form, taxEnabled: e.target.checked })}
            className="rounded border-sand-300 text-orange-500 focus:ring-orange-500 w-4 h-4" />
          Enable tax calculation
        </label>
        {form.taxEnabled && (
          <Input
            label="Tax Rate (%)"
            type="number"
            value={String(form.taxRate)}
            onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
          />
        )}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-ink-900/60">Receipt Footer</label>
          <textarea value={form.receiptFooter} rows={3}
            onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
            className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 resize-none transition" />
        </div>
      </div>
      <Button onClick={() => mutation.mutate(form)} loading={mutation.isPending}>
        Save Changes
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function SecurityTab({ data }: { data: SecuritySettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(data);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: updateSecuritySettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setToast({ message: "Security settings updated", type: "success" }); },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-lg text-ink-900">Security Settings</h3>
        <p className="text-sm text-ink-900/45 mt-1">Configure security and access preferences</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Min Password Length"
          type="number"
          value={String(form.minPasswordLength)}
          onChange={(e) => setForm({ ...form, minPasswordLength: Number(e.target.value) })}
        />
        <Input
          label="Session Expiration (minutes)"
          type="number"
          value={String(form.sessionExpirationMinutes)}
          onChange={(e) => setForm({ ...form, sessionExpirationMinutes: Number(e.target.value) })}
        />
        <Input
          label="Max Login Attempts"
          type="number"
          value={String(form.maxLoginAttempts)}
          onChange={(e) => setForm({ ...form, maxLoginAttempts: Number(e.target.value) })}
          hint="Lock account after this many failed attempts"
        />
        <Input
          label="Lockout Duration (minutes)"
          type="number"
          value={String(form.lockoutDurationMinutes)}
          onChange={(e) => setForm({ ...form, lockoutDurationMinutes: Number(e.target.value) })}
        />
      </div>
      <Button onClick={() => mutation.mutate(form)} loading={mutation.isPending}>
        Save Changes
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function ProfileTab({ data }: { data: UserProfile }) {
  const qc = useQueryClient();
  const { updateUser } = useAuth();
  const [form, setForm] = useState({ name: data.name, email: data.email, phone: data.phone || "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { setForm({ name: data.name, email: data.email, phone: data.phone || "" }); }, [data]);

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      updateUser({
        name: updated.name,
        email: updated.email,
        ...(updated.phone !== undefined ? { phone: updated.phone } : {}),
      });
      setToast({ message: "Profile updated", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed", type: "error" }),
  });

  const pwMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => { setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setToast({ message: "Password changed. Please log in again.", type: "success" }); },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Password change failed", type: "error" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("picture", file);
      const { data: res } = await api.post<{ profilePicture: string }>("/profile/picture", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      updateUser({ profilePicture: res.profilePicture });
      setToast({ message: "Profile picture updated", type: "success" });
    },
    onError: (e: unknown) => setToast({ message: (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Upload failed", type: "error" }),
  });

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const passwordsMatch = pwForm.newPassword === pwForm.confirmPassword;
  const canChangePassword = pwForm.currentPassword && pwForm.newPassword && passwordsMatch;

  const initials = data.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-bold text-lg text-ink-900">Profile Information</h3>
        <p className="text-sm text-ink-900/45 mt-1">Manage your personal details</p>
      </div>
      <div className="space-y-5 max-w-lg">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {data.profilePicture ? (
              <img src={data.profilePicture} alt={data.name} className="w-20 h-20 rounded-full object-cover ring-2 ring-sand-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-orange-500 text-white flex items-center justify-center text-xl font-medium ring-2 ring-sand-200">
                {initials}
              </div>
            )}
            <label className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition">
              <Camera size={20} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handlePictureUpload} />
            </label>
          </div>
          <div>
            <div className="font-medium text-ink-900 text-lg">{data.name}</div>
            <div className="text-sm text-ink-900/40 capitalize">{data.role.replace("_", " ")}</div>
            {data.staffId && <div className="text-xs text-ink-900/40 font-mono mt-0.5">{data.staffId}</div>}
          </div>
        </div>
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <div className="text-sm text-ink-900/40">Role: <span className="capitalize font-medium text-ink-900/60">{data.role.replace("_", " ")}</span></div>
        <Button onClick={() => profileMutation.mutate(form)} loading={profileMutation.isPending}>
          Update Profile
        </Button>
      </div>

      <hr className="border-sand-200" />

      <div>
        <h3 className="font-bold text-lg text-ink-900">Change Password</h3>
        <p className="text-sm text-ink-900/45 mt-1">Update your password regularly</p>
      </div>
      <div className="space-y-4 max-w-lg">
        <Input
          label="Current Password"
          type="password"
          value={pwForm.currentPassword}
          onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
        />
        <Input
          label="New Password"
          type={showPw ? "text" : "password"}
          value={pwForm.newPassword}
          onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
        />
        <Input
          label="Confirm New Password"
          type="password"
          value={pwForm.confirmPassword}
          onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
          error={pwForm.confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined}
        />
        <Button
          onClick={() => pwMutation.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })}
          loading={pwMutation.isPending}
          disabled={!canChangePassword}
        >
          Change Password
        </Button>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function Settings() {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsKey>("pharmacy");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.title, true]))
  );
  const canManage = hasPermission("manage_settings");

  const { data: settings, isLoading: settingsLoading, error: settingsError } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchAllSettings,
    enabled: canManage,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const allItems = SETTINGS_SECTIONS.flatMap((s) => s.items);

  if (!canManage) {
    return (
      <div className="flex gap-6">
        {/* Settings Sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-card border border-line-soft overflow-hidden shadow-panel sticky top-6">
            <div className="p-4 border-b border-sand-200">
              <h2 className="font-bold text-lg text-ink-900">Settings</h2>
            </div>
            <nav className="p-2">
              <button
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition ${
                  activeTab === "profile"
                    ? "bg-orange-50 text-orange-600 font-medium"
                    : "text-ink-900/60 hover:bg-sand-50"
                }`}
              >
                <User size={16} />
                My Profile
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-card border border-line-soft p-6 shadow-panel">
          {profileLoading ? <CardSkeleton /> : profile ? <ProfileTab data={profile} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Settings Sidebar */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-card border border-line-soft overflow-hidden shadow-panel sticky top-6">
          <div className="p-4 border-b border-sand-200">
            <h2 className="font-bold text-lg text-ink-900">Settings</h2>
          </div>
          <nav className="p-2">
            {SETTINGS_SECTIONS.map((section) => (
              <div key={section.title} className="mb-1">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-900/35 hover:text-ink-900/50 transition"
                >
                  {section.title}
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${expandedSections[section.title] ? "rotate-0" : "-rotate-90"}`}
                  />
                </button>
                {expandedSections[section.title] && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          onClick={() => setActiveTab(item.key)}
                          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition ${
                            activeTab === item.key
                              ? "bg-orange-50 text-orange-600 font-medium"
                              : "text-ink-900/60 hover:bg-sand-50"
                          }`}
                        >
                          <Icon size={16} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white rounded-card border border-line-soft p-6 shadow-panel">
        {settingsLoading || profileLoading ? (
          <CardSkeleton />
        ) : activeTab === "profile" ? (
          profile ? <ProfileTab data={profile} /> : <CardSkeleton />
        ) : settingsError && canManage ? (
          <div className="text-center py-12">
            <SettingsIcon size={40} className="mx-auto text-ink-900/15 mb-3" />
            <p className="text-sm text-red-600 mb-2">Failed to load settings</p>
            <p className="text-xs text-ink-900/40">Please try again or contact support.</p>
            <Button variant="secondary" className="mt-4 text-xs" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {activeTab === "pharmacy" && settings && <PharmacyTab data={settings.pharmacy} />}
            {activeTab === "inventory" && settings && <InventoryTab data={settings.inventory} />}
            {activeTab === "sales" && settings && <SalesTab data={settings.sales} />}
            {activeTab === "security" && settings && <SecurityTab data={settings.security} />}
          </>
        )}
      </div>
    </div>
  );
}

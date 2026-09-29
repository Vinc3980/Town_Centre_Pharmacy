import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Edit,
  Plus,
  Calendar,
  Heart,
  Activity,
  Stethoscope,
  CreditCard,
  User,
  FileText,
  Camera,
  Upload,
} from "lucide-react";
import {
  getCustomer,
  getCustomerReport,
  updateCustomer,
  addVitals,
  addVisit,
  uploadCustomerImage,
  Customer,
} from "../api/customers";
import { fetchCreditSales } from "../api/sales";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";

type Tab = "personal" | "health" | "vitals" | "visits" | "credit";

const tabs: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "personal", label: "Personal Info", icon: User },
  { key: "health", label: "Health Record", icon: Heart },
  { key: "vitals", label: "Vitals", icon: Activity },
  { key: "visits", label: "Visits", icon: Stethoscope },
  { key: "credit", label: "Credit", icon: CreditCard },
];

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | "";
  bloodGroup: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  allergies: string;
  medicalConditions: string;
  notes: string;
}

interface VitalsFormData {
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  weight: string;
  height: string;
  notes: string;
}

interface VisitFormData {
  reason: string;
  tests: string;
  results: string;
  notes: string;
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [vitalsModalOpen, setVitalsModalOpen] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [customerForm, setCustomerForm] = useState<CustomerFormData>({
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
    address: "",
    emergencyContact: "",
    emergencyPhone: "",
    allergies: "",
    medicalConditions: "",
    notes: "",
  });

  const [vitalsForm, setVitalsForm] = useState<VitalsFormData>({
    bloodPressure: "",
    heartRate: "",
    temperature: "",
    weight: "",
    height: "",
    notes: "",
  });

  const [visitForm, setVisitForm] = useState<VisitFormData>({
    reason: "",
    tests: "",
    results: "",
    notes: "",
  });

  const [uploading, setUploading] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id!),
    enabled: !!id,
  });

  const { data: creditSales = [] } = useQuery({
    queryKey: ["credit-sales"],
    queryFn: fetchCreditSales,
    enabled: activeTab === "credit" && !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id: custId,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => updateCustomer(custId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditModalOpen(false);
      setToast({ message: "Customer updated successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to update customer", type: "error" });
    },
  });

  const vitalsMutation = useMutation({
    mutationFn: ({
      id: custId,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => addVitals(custId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      setVitalsModalOpen(false);
      setVitalsForm({
        bloodPressure: "",
        heartRate: "",
        temperature: "",
        weight: "",
        height: "",
        notes: "",
      });
      setToast({ message: "Vitals recorded successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to record vitals", type: "error" });
    },
  });

  const visitMutation = useMutation({
    mutationFn: ({
      id: custId,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => addVisit(custId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      setVisitModalOpen(false);
      setVisitForm({ reason: "", tests: "", results: "", notes: "" });
      setToast({ message: "Visit recorded successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to record visit", type: "error" });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await uploadCustomerImage(id, file);
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setToast({ message: "Profile image updated", type: "success" });
    } catch {
      setToast({ message: "Failed to upload image", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleOpenEditModal = () => {
    if (!customer) return;
    setCustomerForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      dateOfBirth: customer.dateOfBirth
        ? customer.dateOfBirth.substring(0, 10)
        : "",
      gender: customer.gender || "",
      bloodGroup: customer.bloodGroup || "",
      address: customer.address || "",
      emergencyContact: customer.emergencyContact || "",
      emergencyPhone: customer.emergencyPhone || "",
      allergies: (customer.allergies || []).join(", "),
      medicalConditions: (customer.medicalConditions || []).join(", "),
      notes: customer.notes || "",
    });
    setEditModalOpen(true);
  };

  const handleCustomerFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setCustomerForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const payload: Record<string, unknown> = {
      name: customerForm.name,
      phone: customerForm.phone,
      email: customerForm.email || undefined,
      dateOfBirth: customerForm.dateOfBirth || undefined,
      gender: customerForm.gender || undefined,
      bloodGroup: customerForm.bloodGroup || undefined,
      address: customerForm.address || undefined,
      emergencyContact: customerForm.emergencyContact || undefined,
      emergencyPhone: customerForm.emergencyPhone || undefined,
      allergies: customerForm.allergies
        ? customerForm.allergies
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
      medicalConditions: customerForm.medicalConditions
        ? customerForm.medicalConditions
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [],
      notes: customerForm.notes || undefined,
    };

    updateMutation.mutate({ id, payload });
  };

  const handleVitalsFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setVitalsForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleVitalsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const payload: Record<string, unknown> = {
      bloodPressure: vitalsForm.bloodPressure || undefined,
      heartRate: vitalsForm.heartRate
        ? Number(vitalsForm.heartRate)
        : undefined,
      temperature: vitalsForm.temperature
        ? Number(vitalsForm.temperature)
        : undefined,
      weight: vitalsForm.weight ? Number(vitalsForm.weight) : undefined,
      height: vitalsForm.height ? Number(vitalsForm.height) : undefined,
      notes: vitalsForm.notes || undefined,
    };

    vitalsMutation.mutate({ id, payload });
  };

  const handleVisitFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setVisitForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleVisitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const payload: Record<string, unknown> = {
      reason: visitForm.reason,
      tests: visitForm.tests || undefined,
      results: visitForm.results || undefined,
      notes: visitForm.notes || undefined,
    };

    visitMutation.mutate({ id, payload });
  };

  const isSubmitting =
    updateMutation.isPending ||
    vitalsMutation.isPending ||
    visitMutation.isPending;

  const handleGenerateReport = async () => {
    if (!id) return;
    try {
      const report = await getCustomerReport(id);
      const { customer: c, vitals, visits, generatedAt } = report;

      const vitalsRows = vitals.length > 0
        ? vitals.map((v: Record<string, unknown>) => `
            <tr>
              <td>${new Date(v.date as string).toLocaleDateString()}</td>
              <td>${(v.bloodPressure as string) || "-"}</td>
              <td>${v.heartRate ? `${v.heartRate} bpm` : "-"}</td>
              <td>${v.temperature ? `${v.temperature}°C` : "-"}</td>
              <td>${v.weight ? `${v.weight} kg` : "-"}</td>
              <td>${v.height ? `${v.height} cm` : "-"}</td>
              <td>${(v.notes as string) || "-"}</td>
            </tr>`).join("")
        : '<tr><td colspan="7" style="text-align:center;color:#888;">No vitals recorded.</td></tr>';

      const visitsRows = visits.length > 0
        ? visits.map((v: Record<string, unknown>) => `
            <tr>
              <td>${new Date(v.date as string).toLocaleDateString()}</td>
              <td>${v.reason}</td>
              <td>${(v.tests as string) || "-"}</td>
              <td>${(v.results as string) || "-"}</td>
              <td>${(v.notes as string) || "-"}</td>
            </tr>`).join("")
        : '<tr><td colspan="5" style="text-align:center;color:#888;">No visits recorded.</td></tr>';

      const allergies = c.allergies && c.allergies.length > 0
        ? c.allergies.map((a: string) => `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:9999px;font-size:12px;margin-right:4px;">${a}</span>`).join("")
        : "None";

      const conditions = c.medicalConditions && c.medicalConditions.length > 0
        ? c.medicalConditions.map((m: string) => `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:12px;margin-right:4px;">${m}</span>`).join("")
        : "None";

      const html = `<!DOCTYPE html>
<html><head><title>Patient Report - ${c.name}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #1a1a1a; }
  h1 { font-size: 20px; border-bottom: 2px solid #166534; padding-bottom: 6px; color: #166534; }
  h2 { font-size: 16px; margin-top: 24px; color: #166534; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 13px; }
  th { background: #f3f4f6; font-weight: 600; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 24px; }
  .info-grid p { margin: 0; }
  .label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; }
  .value { font-size: 14px; }
  .print-btn { background: #166534; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 16px; }
  .print-btn:hover { background: #14532d; }
  .meta { font-size: 11px; color: #9ca3af; margin-top: 8px; }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <h1>Patient Medical Report</h1>
    <button class="print-btn" onclick="window.print()">Print Report</button>
  </div>
  <p class="meta">Generated: ${new Date(generatedAt).toLocaleString()}</p>

  <h2>Personal Information</h2>
  <div class="info-grid">
    <div><p class="label">Name</p><p class="value">${c.name}</p></div>
    <div><p class="label">Phone</p><p class="value">${c.phone}</p></div>
    <div><p class="label">Email</p><p class="value">${c.email || "-"}</p></div>
    <div><p class="label">Date of Birth</p><p class="value">${c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString() : "-"}</p></div>
    <div><p class="label">Gender</p><p class="value">${c.gender ? c.gender.charAt(0).toUpperCase() + c.gender.slice(1) : "-"}</p></div>
    <div><p class="label">Blood Group</p><p class="value">${c.bloodGroup || "-"}</p></div>
    <div><p class="label">Address</p><p class="value">${c.address || "-"}</p></div>
    <div><p class="label">Emergency Contact</p><p class="value">${c.emergencyContact || "-"}</p></div>
    <div><p class="label">Emergency Phone</p><p class="value">${c.emergencyPhone || "-"}</p></div>
  </div>

  <h2>Allergies</h2>
  <p>${allergies}</p>

  <h2>Medical Conditions</h2>
  <p>${conditions}</p>

  ${c.notes ? `<h2>Notes</h2><p>${c.notes}</p>` : ""}

  <h2>Vitals History</h2>
  <table>
    <thead><tr><th>Date</th><th>Blood Pressure</th><th>Heart Rate</th><th>Temperature</th><th>Weight</th><th>Height</th><th>Notes</th></tr></thead>
    <tbody>${vitalsRows}</tbody>
  </table>

  <h2>Visit History</h2>
  <table>
    <thead><tr><th>Date</th><th>Reason</th><th>Tests</th><th>Results</th><th>Notes</th></tr></thead>
    <tbody>${visitsRows}</tbody>
  </table>

  <div style="text-align:center;margin-top:24px;">
    <button class="print-btn" onclick="window.print()">Print Report</button>
  </div>
</body></html>`;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch {
      setToast({ message: "Failed to generate report", type: "error" });
    }
  };

  const customerSales = creditSales.filter((s) => {
    if (!s.customer) return false;
    if (typeof s.customer === "string") return s.customer === id;
    return s.customer._id === id;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-center py-12">
            <p className="text-clay-600">Loading customer details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-clay-600">Customer not found.</p>
            <button
              onClick={() => navigate("/customers")}
              className="text-sm font-medium text-pine-700 hover:underline"
            >
              Back to customers
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sortedVitals = [...(customer.vitals || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const sortedVisits = [...(customer.visits || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/customers")}
              className="rounded-lg p-2 text-clay-600 transition-colors hover:bg-sand-200 hover:text-ink-900"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-ink-900">
                {customer.name}
              </h1>
              <p className="text-sm text-clay-600">{customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateReport}
              className="flex items-center gap-2 rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-sand-100"
            >
              <FileText size={16} />
              Generate Report
            </button>
            <button
              onClick={handleOpenEditModal}
              className="flex items-center gap-2 rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800"
            >
              <Edit size={16} />
              Edit
            </button>
          </div>
        </div>

        <div className="mb-6 border-b border-sand-200">
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border-pine-700 text-pine-700"
                      : "border-transparent text-clay-600 hover:text-ink-900"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {activeTab === "personal" && (
          <div className="rounded-xl border border-sand-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-ink-900">
              Personal Information
            </h2>

            <div className="mb-6 flex items-center gap-6">
              <label className="relative flex-shrink-0 cursor-pointer group">
                {customer.profileImage ? (
                  <img
                    src={customer.profileImage}
                    alt={customer.name}
                    className="h-24 w-24 rounded-full object-cover border-2 border-sand-200 group-hover:opacity-80 transition"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sand-100 border-2 border-sand-200 group-hover:bg-sand-200 transition">
                    <User size={36} className="text-clay-600" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink-900/0 group-hover:bg-ink-900/30 transition">
                  <Camera size={20} className="text-white opacity-0 group-hover:opacity-100 transition" />
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
              <div>
                <p className="text-sm font-medium text-ink-900">Profile Photo</p>
                <p className="text-xs text-clay-600 mb-2">JPG, PNG or WebP. Max 5 MB.</p>
                <div className="flex gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors hover:bg-sand-100">
                    <Camera size={14} />
                    {uploading ? "Uploading..." : "Take Photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors hover:bg-sand-100">
                    <Upload size={14} />
                    {uploading ? "Uploading..." : "Upload File"}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-clay-600">Name</p>
                <p className="text-sm text-ink-900">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">Phone</p>
                <p className="text-sm text-ink-900">{customer.phone}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">Email</p>
                <p className="text-sm text-ink-900">
                  {customer.email || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">
                  Date of Birth
                </p>
                <p className="text-sm text-ink-900">
                  {customer.dateOfBirth
                    ? new Date(customer.dateOfBirth).toLocaleDateString()
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">Gender</p>
                <p className="text-sm text-ink-900">
                  {customer.gender
                    ? customer.gender.charAt(0).toUpperCase() +
                      customer.gender.slice(1)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">
                  Blood Group
                </p>
                <p className="text-sm text-ink-900">
                  {customer.bloodGroup || "-"}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-clay-600">Address</p>
                <p className="text-sm text-ink-900">
                  {customer.address || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">
                  Emergency Contact
                </p>
                <p className="text-sm text-ink-900">
                  {customer.emergencyContact || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-clay-600">
                  Emergency Phone
                </p>
                <p className="text-sm text-ink-900">
                  {customer.emergencyPhone || "-"}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-clay-600">
                  Allergies
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {customer.allergies && customer.allergies.length > 0 ? (
                    customer.allergies.map((allergy, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
                      >
                        {allergy}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-ink-900">None</p>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-clay-600">
                  Medical Conditions
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {customer.medicalConditions &&
                  customer.medicalConditions.length > 0 ? (
                    customer.medicalConditions.map((condition, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {condition}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-ink-900">None</p>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-clay-600">Notes</p>
                <p className="text-sm text-ink-900">
                  {customer.notes || "-"}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "health" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-sand-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-ink-900">
                Health Record Summary
              </h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-clay-600">
                    Allergies
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {customer.allergies && customer.allergies.length > 0 ? (
                      customer.allergies.map((allergy, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"
                        >
                          {allergy}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-clay-600">
                        No known allergies
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-clay-600">
                    Medical Conditions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalConditions &&
                    customer.medicalConditions.length > 0 ? (
                      customer.medicalConditions.map((condition, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
                        >
                          {condition}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-clay-600">
                        No recorded conditions
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-sand-200 bg-white p-6">
              <h3 className="mb-2 text-sm font-medium text-clay-600">
                Outstanding Balance
              </h3>
              <p
                className={`text-3xl font-bold ${
                  customer.outstandingBalance > 0
                    ? "text-clay-600"
                    : "text-pine-700"
                }`}
              >
                {customer.outstandingBalance.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {activeTab === "vitals" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-900">
                Vitals History
              </h2>
              <button
                onClick={() => setVitalsModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800"
              >
                <Plus size={16} />
                Add Vitals
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 bg-sand-100">
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Date
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Blood Pressure
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Heart Rate
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Temperature
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Weight
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Height
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVitals.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-clay-600"
                        >
                          No vitals recorded yet.
                        </td>
                      </tr>
                    ) : (
                      sortedVitals.map((vital, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-sand-200 last:border-0 hover:bg-sand-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {new Date(vital.date).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.bloodPressure || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.heartRate
                              ? `${vital.heartRate} bpm`
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.temperature
                              ? `${vital.temperature}°C`
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.weight ? `${vital.weight} kg` : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.height ? `${vital.height} cm` : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {vital.notes || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "visits" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-900">
                Visit History
              </h2>
              <button
                onClick={() => setVisitModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800"
              >
                <Plus size={16} />
                Add Visit
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 bg-sand-100">
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Date
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Reason
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Tests
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Results
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVisits.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-clay-600"
                        >
                          No visits recorded yet.
                        </td>
                      </tr>
                    ) : (
                      sortedVisits.map((visit, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-sand-200 last:border-0 hover:bg-sand-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {new Date(visit.date).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {visit.reason}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {visit.tests || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {visit.results || "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {visit.notes || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "credit" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-sand-200 bg-white p-6">
              <h2 className="mb-2 text-sm font-medium text-clay-600">
                Outstanding Balance
              </h2>
              <p
                className={`text-4xl font-bold ${
                  customer.outstandingBalance > 0
                    ? "text-clay-600"
                    : "text-pine-700"
                }`}
              >
                {customer.outstandingBalance.toFixed(2)}
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
              <div className="border-b border-sand-200 bg-sand-100 px-4 py-3">
                <h3 className="text-sm font-medium text-ink-900">
                  Sales with Outstanding Amount
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sand-200">
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Transaction #
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Date
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Total
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-ink-900">
                        Outstanding
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerSales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-clay-600"
                        >
                          No outstanding sales.
                        </td>
                      </tr>
                    ) : (
                      customerSales.map((sale) => (
                        <tr
                          key={sale._id}
                          className="border-b border-sand-200 last:border-0 hover:bg-sand-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-pine-700">
                            {sale.transactionNumber}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {new Date(sale.createdAt).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-900">
                            {sale.total.toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-clay-600">
                            {(sale.outstandingAmount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer"
        size="lg"
      >
        <form onSubmit={handleCustomerSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Name <span className="text-clay-600">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={customerForm.name}
                onChange={handleCustomerFormChange}
                required
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Phone <span className="text-clay-600">*</span>
              </label>
              <input
                type="text"
                name="phone"
                value={customerForm.phone}
                onChange={handleCustomerFormChange}
                required
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={customerForm.email}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Date of Birth
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={customerForm.dateOfBirth}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Gender
              </label>
              <select
                name="gender"
                value={customerForm.gender}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Blood Group
              </label>
              <select
                name="bloodGroup"
                value={customerForm.bloodGroup}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              >
                <option value="">Select blood group</option>
                {bloodGroups.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Address
            </label>
            <textarea
              name="address"
              value={customerForm.address}
              onChange={handleCustomerFormChange}
              rows={2}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Emergency Contact
              </label>
              <input
                type="text"
                name="emergencyContact"
                value={customerForm.emergencyContact}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Emergency Phone
              </label>
              <input
                type="text"
                name="emergencyPhone"
                value={customerForm.emergencyPhone}
                onChange={handleCustomerFormChange}
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Allergies
            </label>
            <input
              type="text"
              name="allergies"
              value={customerForm.allergies}
              onChange={handleCustomerFormChange}
              placeholder="e.g. Penicillin, Aspirin, Shellfish"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
            <p className="mt-1 text-xs text-clay-600">
              Comma-separated list
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Medical Conditions
            </label>
            <input
              type="text"
              name="medicalConditions"
              value={customerForm.medicalConditions}
              onChange={handleCustomerFormChange}
              placeholder="e.g. Diabetes, Hypertension, Asthma"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
            <p className="mt-1 text-xs text-clay-600">
              Comma-separated list
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Notes
            </label>
            <textarea
              name="notes"
              value={customerForm.notes}
              onChange={handleCustomerFormChange}
              rows={3}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-sand-200 pt-4">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="rounded-lg border border-sand-200 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-sand-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Update Customer"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={vitalsModalOpen}
        onClose={() => setVitalsModalOpen(false)}
        title="Add Vitals"
        size="md"
      >
        <form onSubmit={handleVitalsSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Blood Pressure
              </label>
              <input
                type="text"
                name="bloodPressure"
                value={vitalsForm.bloodPressure}
                onChange={handleVitalsFormChange}
                placeholder="e.g. 120/80"
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Heart Rate (bpm)
              </label>
              <input
                type="number"
                name="heartRate"
                value={vitalsForm.heartRate}
                onChange={handleVitalsFormChange}
                placeholder="e.g. 72"
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Temperature (°C)
              </label>
              <input
                type="number"
                step="0.1"
                name="temperature"
                value={vitalsForm.temperature}
                onChange={handleVitalsFormChange}
                placeholder="e.g. 36.5"
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                name="weight"
                value={vitalsForm.weight}
                onChange={handleVitalsFormChange}
                placeholder="e.g. 70"
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.1"
                name="height"
                value={vitalsForm.height}
                onChange={handleVitalsFormChange}
                placeholder="e.g. 175"
                className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Notes
            </label>
            <textarea
              name="notes"
              value={vitalsForm.notes}
              onChange={handleVitalsFormChange}
              rows={2}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-sand-200 pt-4">
            <button
              type="button"
              onClick={() => setVitalsModalOpen(false)}
              className="rounded-lg border border-sand-200 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-sand-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Vitals"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={visitModalOpen}
        onClose={() => setVisitModalOpen(false)}
        title="Add Visit"
        size="md"
      >
        <form onSubmit={handleVisitSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Reason <span className="text-clay-600">*</span>
            </label>
            <input
              type="text"
              name="reason"
              value={visitForm.reason}
              onChange={handleVisitFormChange}
              required
              placeholder="e.g. Annual checkup, Follow-up"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Tests
            </label>
            <textarea
              name="tests"
              value={visitForm.tests}
              onChange={handleVisitFormChange}
              rows={2}
              placeholder="e.g. Blood sugar, CBC, Urinalysis"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Results
            </label>
            <textarea
              name="results"
              value={visitForm.results}
              onChange={handleVisitFormChange}
              rows={2}
              placeholder="e.g. Normal, Elevated glucose"
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 placeholder-clay-600 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900">
              Notes
            </label>
            <textarea
              name="notes"
              value={visitForm.notes}
              onChange={handleVisitFormChange}
              rows={2}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-900 focus:border-pine-700 focus:outline-none focus:ring-1 focus:ring-pine-700"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-sand-200 pt-4">
            <button
              type="button"
              onClick={() => setVisitModalOpen(false)}
              className="rounded-lg border border-sand-200 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-sand-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-800 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Visit"}
            </button>
          </div>
        </form>
      </Modal>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Edit, Trash2, User } from "lucide-react";
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  Customer,
} from "../api/customers";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import { useAuth } from "../context/AuthContext";

interface FormData {
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

const initialFormData: FormData = {
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
};

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function CustomerList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const {
    data: customers = [],
    isLoading,
  } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => fetchCustomers(search || undefined),
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setModalOpen(false);
      setFormData(initialFormData);
      setToast({ message: "Customer created successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to create customer", type: "error" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => updateCustomer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setModalOpen(false);
      setEditingCustomer(null);
      setFormData(initialFormData);
      setToast({ message: "Customer updated successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to update customer", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setToast({ message: "Customer deleted successfully", type: "success" });
    },
    onError: () => {
      setToast({ message: "Failed to delete customer", type: "error" });
    },
  });

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setFormData(initialFormData);
    setModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
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
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingCustomer(null);
    setFormData(initialFormData);
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email || undefined,
      dateOfBirth: formData.dateOfBirth || undefined,
      gender: formData.gender || undefined,
      bloodGroup: formData.bloodGroup || undefined,
      address: formData.address || undefined,
      emergencyContact: formData.emergencyContact || undefined,
      emergencyPhone: formData.emergencyPhone || undefined,
      allergies: formData.allergies
        ? formData.allergies
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
      medicalConditions: formData.medicalConditions
        ? formData.medicalConditions
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : [],
      notes: formData.notes || undefined,
    };

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (customer: Customer) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${customer.name}"? This action cannot be undone.`
      )
    ) {
      deleteMutation.mutate(customer._id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Customers</h1>
        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 rounded-control bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          Add customer
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 p-3 bg-white rounded-card border border-line">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-control border border-line bg-white py-2 pl-10 pr-4 text-sm text-navy placeholder-gray-soft focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray"></th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Name</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Phone</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Email</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Gender</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Blood Group</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Outstanding Balance</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray">Loading customers...</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray">No customers found.</td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer._id} className="hover:bg-paper transition">
                    <td className="px-4 py-3">
                      {customer.profileImage ? (
                        <img src={customer.profileImage} alt={customer.name} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                          <User size={14} className="text-blue-600" />
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-navy">{customer.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy">{customer.phone}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy">{customer.email || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy">
                      {customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy">{customer.bloodGroup || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={customer.outstandingBalance > 0 ? "font-medium text-red" : "text-navy"}>
                        {customer.outstandingBalance.toFixed(2)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => navigate(`/customers/${customer._id}`)} className="rounded-control p-1.5 text-gray-soft hover:text-blue-600 hover:bg-blue-50 transition" title="View">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => handleOpenEditModal(customer)} className="rounded-control p-1.5 text-gray-soft hover:text-blue-600 hover:bg-blue-50 transition" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(customer)} disabled={deleteMutation.isPending} className="rounded-control p-1.5 text-gray-soft hover:text-red hover:bg-red-bg disabled:opacity-50 transition" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title={editingCustomer ? "Edit Customer" : "Add Customer"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Name <span className="text-red">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Phone <span className="text-clay-600">*</span>
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Date of Birth
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Gender
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Blood Group
              </label>
              <select
                name="bloodGroup"
                value={formData.bloodGroup}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
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
            <label className="mb-1 block text-sm font-medium text-navy">
              Address
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={2}
              className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Emergency Contact
              </label>
              <input
                type="text"
                name="emergencyContact"
                value={formData.emergencyContact}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Emergency Phone
              </label>
              <input
                type="text"
                name="emergencyPhone"
                value={formData.emergencyPhone}
                onChange={handleChange}
                className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-navy">
              Allergies
            </label>
            <input
              type="text"
              name="allergies"
              value={formData.allergies}
              onChange={handleChange}
              placeholder="e.g. Penicillin, Aspirin, Shellfish"
              className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy placeholder-gray-soft focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <p className="mt-1 text-xs text-gray">
              Comma-separated list
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-navy">
              Medical Conditions
            </label>
            <input
              type="text"
              name="medicalConditions"
              value={formData.medicalConditions}
              onChange={handleChange}
              placeholder="e.g. Diabetes, Hypertension, Asthma"
              className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy placeholder-gray-soft focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
            <p className="mt-1 text-xs text-gray">
              Comma-separated list
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-navy">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-control border border-line px-3 py-2 text-sm text-navy focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="rounded-control border border-line px-4 py-2 text-sm font-medium text-navy transition-colors hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-control bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : editingCustomer
                  ? "Update Customer"
                  : "Create Customer"}
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

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createExpense } from "../api/expenses";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Toast from "../components/ui/Toast";

const expenseSchema = z.object({
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required").max(500),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paymentMethod: z.string().min(1),
  date: z.string().min(1, "Date is required"),
});

type ExpenseForm = z.infer<typeof expenseSchema>;

const CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "salaries", label: "Salaries" },
  { value: "transport", label: "Transport" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "insurance", label: "Insurance" },
  { value: "taxes", label: "Taxes" },
  { value: "misc", label: "Miscellaneous" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

export default function ExpenseFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: "misc",
      description: "",
      amount: 0,
      paymentMethod: "cash",
      date: new Date().toISOString().split("T")[0],
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ExpenseForm) => createExpense(
      { ...data },
      receipt ?? undefined
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses-list"] });
      navigate("/expenses");
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed to create expense";
      setToast({ message, type: "error" });
    },
  });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-lg font-bold text-ink-900">New Expense</h1>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="bg-white rounded-card border border-line-soft shadow-panel p-6 space-y-4" noValidate>
        <Select
          label="Category"
          options={CATEGORIES}
          error={errors.category?.message}
          {...register("category")}
        />

        <div className="space-y-1">
          <label htmlFor="description" className="block text-xs font-medium text-ink-900/60">Description</label>
          <textarea
            id="description"
            rows={3}
            placeholder="What was this expense for?"
            aria-invalid={!!errors.description}
            {...register("description")}
            className="w-full px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 resize-none transition"
          />
          {errors.description && <p className="text-xs text-red-600" role="alert">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount (GH₵)"
            type="number"
            step="0.01"
            min="0.01"
            error={errors.amount?.message}
            {...register("amount")}
          />
          <Input
            label="Date"
            type="date"
            error={errors.date?.message}
            {...register("date")}
          />
        </div>

        <Select
          label="Payment Method"
          options={PAYMENT_METHODS}
          error={errors.paymentMethod?.message}
          {...register("paymentMethod")}
        />

        <div className="space-y-1">
          <label className="block text-xs font-medium text-ink-900/60">Receipt (optional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-ink-900/60 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sand-100 file:text-ink-900/70 hover:file:bg-sand-200 file:cursor-pointer"
          />
          {receipt && (
            <p className="text-xs text-ink-900/40">{receipt.name}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={mutation.isPending}>
            Create expense
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate("/expenses")}>
            Cancel
          </Button>
        </div>
      </form>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

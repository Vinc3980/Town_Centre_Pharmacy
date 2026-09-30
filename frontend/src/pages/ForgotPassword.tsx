import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, CheckCircle, Pill } from "lucide-react";
import { requestPasswordReset } from "../api/users";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import Toast from "../components/ui/Toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const sendRequest = async () => {
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setToast({ message: (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Something went wrong", type: "error" });
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setShowConfirm(true);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15,27,51,0.55), rgba(19,79,203,0.55)), url('/assets/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-panel p-9">
        {/* Brand block (sidebar treatment) */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Pill size={17} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-lg text-navy leading-tight">Town Centre</div>
            <div className="text-blue-600 text-[10px] uppercase tracking-widest font-medium">Pharmacy</div>
          </div>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-navy">Request Sent</h1>
            <p className="text-gray text-sm">
              Your password reset request has been sent to the admin or any user with
              user-management permission. They can change your password for you.
            </p>
            <Link to="/login" className="inline-block mt-4">
              <Button variant="secondary">Return to Login</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-navy mb-2">Forgot password?</h1>
              <p className="text-sm text-gray">
                Submit a request and the admin or any user with user-management permission will
                set a new password for you.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. john@towncentrepharmacy.gh"
                icon={<Mail size={16} />}
                required
              />
              <Button type="submit" size="lg" className="w-full">
                Submit
              </Button>
            </form>

            <Link to="/login" className="inline-flex items-center gap-1.5 mt-6 text-sm text-blue-600 hover:text-blue-700 font-medium transition">
              <ArrowLeft size={14} /> Return to Login
            </Link>
          </>
        )}

        <p className="text-[10px] text-gray-soft/80 text-center mt-8">
          Copyright © 2025 · Town Centre Pharmacy · Background photo © Harrison Keely (CC BY 4.0)
        </p>
      </div>

      <Modal open={showConfirm} onClose={() => !loading && setShowConfirm(false)} title="Send password reset request?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray">
            Your request will be sent to the admin or any user with user-management permission,
            who can set a new password for <strong className="text-navy">{email}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={sendRequest} loading={loading}>
              Send Request
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

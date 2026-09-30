import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../context/AuthContext";
import { Lock, Mail, Eye, EyeOff, Pill } from "lucide-react";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

const loginSchema = z.object({
  email: z.string().min(1, "Email or Staff ID is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginForm) {
    setServerError("");
    try {
      await login(data.email, data.password);
      navigate("/");
    } catch {
      setServerError("That email or password doesn't match our records.");
    }
  }

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
            <div className="font-bold text-lg text-navy leading-tight">Adom</div>
            <div className="text-blue-600 text-[10px] uppercase tracking-widest font-medium">Pharmacy</div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-navy mb-2">Sign In</h1>
          <p className="text-sm text-gray">
            Access your pharmacy panel using your email and passcode.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Input
            label="Email"
            type="text"
            autoComplete="username"
            placeholder="e.g. admin@adompharmacy.gh or ST-0001"
            icon={<Mail size={16} />}
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            icon={<Lock size={16} />}
            error={errors.password?.message}
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-soft hover:text-navy focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register("password")}
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-line text-blue-600 focus:ring-blue-500"
              />
              Remember Me
            </label>
            <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition">
              Forgot Password?
            </Link>
          </div>

          {serverError && (
            <div className="bg-red-bg border border-red/20 rounded-control px-4 py-3 text-sm text-red" role="alert">
              {serverError}
            </div>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
            Sign In
          </Button>
        </form>

        <p className="text-[10px] text-gray-soft/80 text-center mt-8">
          Copyright © 2025 · AdomPharmacy · Background photo © Harrison Keely (CC BY 4.0)
        </p>
      </div>
    </div>
  );
}

"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { loginRequest } from "@/lib/api";

type FormErrors = {
  email?: string;
  password?: string;
  general?: string;
};

function validate(email: string, password: string): FormErrors {
  const errors: FormErrors = {};

  if (!email.trim()) {
    errors.email = "El correo electrónico es obligatorio.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Ingrese un correo electrónico válido.";
  }

  if (!password.trim()) {
    errors.password = "La contraseña es obligatoria.";
  } else if (password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(email, password);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const data = await loginRequest(email, password);
      localStorage.setItem("authToken", data.token.access);
      localStorage.setItem("refreshToken", data.token.refresh);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      localStorage.setItem("rememberSession", JSON.stringify(remember));
      router.push("/dashboard");
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Error desconocido al iniciar sesión.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700" htmlFor="email">
          Correo electrónico
        </label>
        <div className={`flex items-center rounded-2xl border bg-white px-4 ${errors.email ? "border-red-400" : "border-slate-200"}`}>
          <Mail className="h-4 w-4 text-slate-400" />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border-0 px-3 py-4 text-sm text-slate-900 outline-none"
            placeholder="admin@colegio.com"
          />
        </div>
        {errors.email ? <p className="text-sm text-red-600">{errors.email}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700" htmlFor="password">
          Contraseña
        </label>
        <div className={`flex items-center rounded-2xl border bg-white px-4 ${errors.password ? "border-red-400" : "border-slate-200"}`}>
          <LockKeyhole className="h-4 w-4 text-slate-400" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border-0 px-3 py-4 text-sm text-slate-900 outline-none"
            placeholder="Ingrese su contraseña"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="text-slate-500 transition hover:text-slate-800"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.password ? <p className="text-sm text-red-600">{errors.password}</p> : null}
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky focus:ring-sky"
          />
          Recordar sesión
        </label>
        <a href="#" className="font-medium text-sky transition hover:text-navy">
          ¿Olvidó su contraseña?
        </a>
      </div>

      {errors.general ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.general}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-sky/20 bg-sky/10 px-4 py-4 text-sm font-medium text-navy">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Validando credenciales, por favor espere...
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-navy px-4 py-4 text-sm font-semibold text-white shadow-panel transition hover:bg-sky disabled:cursor-not-allowed disabled:opacity-70"
      >
        Iniciar sesión
      </button>
    </form>
  );
}

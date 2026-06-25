import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/login-form";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-panel md:min-h-[720px] md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex items-center bg-navy p-8 text-white md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(43,119,243,0.4),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col justify-center gap-10">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                <ShieldCheck className="h-8 w-8 text-sky-200" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-200">Acceso Seguro</p>
                <h1 className="text-2xl font-bold">Sistema Escolar</h1>
              </div>
            </div>

            <div className="max-w-md">
              <h2 className="text-4xl font-bold leading-tight md:text-5xl">
                Plataforma administrativa para la gestión escolar moderna.
              </h2>
              <p className="mt-6 text-base leading-7 text-sky-100/90">
                Administre usuarios, estudiantes, reportes y trazabilidad institucional desde un único panel seguro y responsivo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Usuarios", "Gestión centralizada"],
                ["Auditoría", "Control operativo"],
                ["Reportes", "Indicadores mensuales"],
              ].map(([title, subtitle]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-sky-100/80">{subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white p-6 md:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky">Administrador</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Bienvenido de nuevo</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Ingrese sus credenciales para acceder al panel principal del Sistema Escolar.
              </p>
            </div>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}

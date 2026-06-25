"use client";

import { ChartColumn } from "lucide-react";

import { AdminShell } from "@/components/admin-shell";

const chartData = [
  { month: "Ene", value: 48 },
  { month: "Feb", value: 55 },
  { month: "Mar", value: 72 },
  { month: "Abr", value: 68 },
  { month: "May", value: 80 },
  { month: "Jun", value: 91 },
];

const recentRecords = [
  { modulo: "Usuarios", detalle: "Nuevo administrador auxiliar", fecha: "2026-06-12", estado: "Activo" },
  { modulo: "Estudiantes", detalle: "Registro académico actualizado", fecha: "2026-06-11", estado: "Pendiente" },
  { modulo: "Reportes", detalle: "Exportación mensual generada", fecha: "2026-06-10", estado: "Completado" },
  { modulo: "Auditoría", detalle: "Bitácora de accesos consolidada", fecha: "2026-06-09", estado: "Verificado" },
];

export function DashboardShell() {
  return (
    <AdminShell activeItem="Dashboard" eyebrow="Resumen ejecutivo" title="Dashboard administrativo">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Usuarios activos", "1,284", "+12% este mes"],
          ["Estudiantes", "3,947", "+8 nuevos ingresos"],
          ["Registros auditados", "215", "Últimos 7 días"],
          ["Mensajes pendientes", "17", "Atención prioritaria"],
        ].map(([title, value, subtitle]) => (
          <article key={title} className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <p className="text-sm text-slate-500">{title}</p>
            <p className="mt-4 text-4xl font-bold text-slate-900">{value}</p>
            <p className="mt-3 text-sm text-sky">{subtitle}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Actividad reciente</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Registros recientes</h3>
            </div>
            <ChartColumn className="h-6 w-6 text-sky" />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Módulo</th>
                  <th className="pb-3 font-medium">Detalle</th>
                  <th className="pb-3 font-medium">Fecha</th>
                  <th className="pb-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRecords.map((record) => (
                  <tr key={`${record.modulo}-${record.fecha}`} className="text-slate-700">
                    <td className="py-4 font-semibold">{record.modulo}</td>
                    <td className="py-4">{record.detalle}</td>
                    <td className="py-4">{record.fecha}</td>
                    <td className="py-4">
                      <span className="rounded-full bg-sky/10 px-3 py-1 text-xs font-semibold text-sky">
                        {record.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Indicadores</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Registros por mes</h3>
          <div className="mt-8 flex h-72 items-end justify-between gap-3">
            {chartData.map((item) => (
              <div key={item.month} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex h-56 w-full items-end rounded-3xl bg-slateBlue p-2">
                  <div
                    className="w-full rounded-2xl bg-gradient-to-b from-sky to-navy transition-all"
                    style={{ height: `${item.value}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-600">{item.month}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}

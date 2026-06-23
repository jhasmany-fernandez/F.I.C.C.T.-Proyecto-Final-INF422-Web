"use client";

import { CalendarDays, RefreshCcw, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import { AccessControlRecordItem, ApiError, getAccessControlRecords } from "@/lib/api";

type AccessControlShellProps = {
  activeItem: string;
  title: string;
  eyebrow: string;
  recordType: "INGRESO" | "ASISTENCIA";
};

const today = new Date().toISOString().slice(0, 10);

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la solicitud.";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin dato";
  return new Date(value).toLocaleString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AccessControlShell({
  activeItem,
  title,
  eyebrow,
  recordType,
}: AccessControlShellProps) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [records, setRecords] = useState<AccessControlRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const childCount = useMemo(
    () =>
      new Set(
        records.map((item) => item?.child?.id).filter((value) => typeof value === "number"),
      ).size,
    [records],
  );

  useEffect(() => {
    void loadRecords();
  }, [date, recordType]);

  async function loadRecords() {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await getAccessControlRecords({
        date,
        record_type: recordType,
      });
      setRecords(response.data ?? []);
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleApiError(error: unknown) {
    const message = normalizeError(error);
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(message);
  }

  return (
    <AdminShell
      activeItem={activeItem}
      eyebrow={eyebrow}
      title={title}
      actions={
        <button
          type="button"
          onClick={() => void loadRecords()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Fecha</p>
            <CalendarDays className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{date}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Registros</p>
            <UserRound className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{records.length}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Niños únicos</p>
            <UserRound className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{childCount}</p>
        </article>
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <label className="flex max-w-xs flex-col gap-2 text-sm text-slate-600">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
        </label>
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Registros del día</h3>
          <p className="mt-1 text-sm text-slate-500">
            Historial operativo para la fecha seleccionada.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-slate-500">
            Cargando registros...
          </div>
        ) : records.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Fecha y hora</th>
                  <th className="pb-3 pr-4 font-medium">Niño</th>
                  <th className="pb-3 pr-4 font-medium">Curso</th>
                  <th className="pb-3 pr-4 font-medium">Centro</th>
                  <th className="pb-3 pr-4 font-medium">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-slate-100 text-slate-700">
                    <td className="py-4 pr-4 whitespace-nowrap">{formatDateTime(record.recorded_at)}</td>
                    <td className="py-4 pr-4 font-semibold">{record.child?.nombre_completo ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{record.child?.curso ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{record.child?.centro_educativo ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{record.recorded_by?.nombre ?? "Sin dato"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-slate-500">
            No hay registros para la fecha seleccionada.
          </div>
        )}
      </section>
    </AdminShell>
  );
}

"use client";

import { CalendarDays, Filter, Fingerprint, RefreshCcw, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import { ApiError, EducationalCenter, PickupDeliveryItem, TutorListItem, getDeliveries, getEducationalCenters, getTutors } from "@/lib/api";

type Filters = {
  date: string;
  tutor_id: string;
};

const today = new Date().toISOString().slice(0, 10);

const initialFilters: Filters = {
  date: today,
  tutor_id: "",
};

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

function biometricLabel(method: string) {
  if (method === "HUELLA") return "Huella";
  if (method === "ROSTRO") return "Rostro";
  return "Biometría";
}

export function PickupDeliveriesShell() {
  return <PickupDeliveriesShellContent activeItem="Historial de Salidas" title="Historial de Salidas" eyebrow="Control de salida" />;
}

type PickupDeliveriesShellContentProps = {
  activeItem: string;
  title: string;
  eyebrow: string;
};

export function PickupDeliveriesShellContent({
  activeItem,
  title,
  eyebrow,
}: PickupDeliveriesShellContentProps) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [deliveries, setDeliveries] = useState<PickupDeliveryItem[]>([]);
  const [tutors, setTutors] = useState<TutorListItem[]>([]);
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const stats = useMemo(() => {
    const tutorsCount = new Set(
      deliveries
        .map((item) => item?.tutor?.id)
        .filter((value) => typeof value === "number"),
    ).size;
    const childrenCount = new Set(
      deliveries
        .map((item) => item?.child?.id)
        .filter((value) => typeof value === "number"),
    ).size;
    const centersCount = new Set(
      deliveries
        .map((item) => item?.child?.centro_educativo)
        .filter((value) => typeof value === "string" && value.length > 0),
    ).size;
    return {
      total: deliveries.length,
      tutors: tutorsCount,
      children: childrenCount,
      centers: centersCount,
    };
  }, [deliveries]);

  useEffect(() => {
    void loadCatalogs();
  }, []);

  useEffect(() => {
    void loadDeliveries();
  }, [filters]);

  async function loadCatalogs() {
    try {
      const [tutorsData, centersData] = await Promise.all([
        getTutors({ page_size: 100 }),
        getEducationalCenters({ page_size: 100 }),
      ]);
      setTutors(tutorsData.results ?? []);
      setCenters(Array.isArray(centersData) ? centersData : centersData.results ?? []);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadDeliveries() {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await getDeliveries(filters);
      setDeliveries(response.data ?? []);
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

  async function refreshAll() {
    await Promise.all([loadCatalogs(), loadDeliveries()]);
  }

  return (
    <AdminShell
      activeItem={activeItem}
      eyebrow={eyebrow}
      title={title}
      actions={
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Retiros del día</p>
            <CalendarDays className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{stats.total}</p>
          <p className="mt-2 text-sm text-slate-500">Fecha: {filters.date || "Sin fecha"}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Tutores que recogieron</p>
            <UserRound className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{stats.tutors}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Niños retirados</p>
            <UserRound className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{stats.children}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Centros involucrados</p>
            <Fingerprint className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{stats.centers}</p>
        </article>
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-sky" />
          <h3 className="text-lg font-bold text-slate-900">Filtros</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-slate-600">
            Fecha
            <input
              type="date"
              value={draftFilters.date}
              onChange={(event) => setDraftFilters((current) => ({ ...current, date: event.target.value }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-600">
            Tutor
            <select
              value={draftFilters.tutor_id}
              onChange={(event) => setDraftFilters((current) => ({ ...current, tutor_id: event.target.value }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
            >
              <option value="">Todos los tutores</option>
              {tutors.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>
                  {tutor.nombre_completo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setFilters(draftFilters)}
            className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftFilters(initialFilters);
              setFilters(initialFilters);
            }}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Restablecer
          </button>
        </div>
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Retiros registrados</h3>
            <p className="mt-1 text-sm text-slate-500">
              Reporte diario de niños recogidos por sus tutores.
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Centros disponibles: {centers.length}
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-slate-500">
            Cargando historial de salidas...
          </div>
        ) : deliveries.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Hora</th>
                  <th className="pb-3 pr-4 font-medium">Niño</th>
                  <th className="pb-3 pr-4 font-medium">Curso</th>
                  <th className="pb-3 pr-4 font-medium">Tutor</th>
                  <th className="pb-3 pr-4 font-medium">Centro</th>
                  <th className="pb-3 pr-4 font-medium">Validación</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-slate-100 text-slate-700">
                    <td className="py-4 pr-4 whitespace-nowrap">{formatDateTime(delivery.confirmed_at)}</td>
                    <td className="py-4 pr-4 font-semibold">{delivery.child?.nombre_completo ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{delivery.child?.curso ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{delivery.tutor?.nombre_completo ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">{delivery.child?.centro_educativo ?? "Sin dato"}</td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                        {biometricLabel(delivery.biometric_method ?? "")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-slate-500">
            No hay retiros registrados para la fecha seleccionada.
          </div>
        )}
      </section>
    </AdminShell>
  );
}

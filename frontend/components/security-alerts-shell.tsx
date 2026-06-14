"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Filter,
  MapPinned,
  RefreshCcw,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  ApiError,
  EducationalCenter,
  SecurityAlertDetail,
  SecurityAlertHistoryResponse,
  SecurityAlertListItem,
  SecurityAlertPriority,
  SecurityAlertStats,
  SecurityAlertStatus,
  getEducationalCenters,
  getSecurityAlertById,
  getSecurityAlertHistory,
  getSecurityAlerts,
  getSecurityAlertStats,
  updateSecurityAlertStatus,
} from "@/lib/api";

type Filters = {
  search: string;
  educational_center_id: string;
  alert_type: string;
  status: string;
  priority: string;
  date_from: string;
  date_to: string;
};

const initialFilters: Filters = {
  search: "",
  educational_center_id: "",
  alert_type: "",
  status: "",
  priority: "",
  date_from: "",
  date_to: "",
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

function statusTone(status: string) {
  if (status === "PENDIENTE") return "bg-amber-100 text-amber-800";
  if (status === "ATENDIDA") return "bg-sky-100 text-sky-800";
  return "bg-slate-200 text-slate-700";
}

function priorityTone(priority: string) {
  if (priority === "ALTA") return "bg-rose-100 text-rose-700";
  if (priority === "MEDIA") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export function SecurityAlertsShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [alerts, setAlerts] = useState<SecurityAlertListItem[]>([]);
  const [stats, setStats] = useState<SecurityAlertStats | null>(null);
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlertDetail | null>(null);
  const [history, setHistory] = useState<SecurityAlertHistoryResponse | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<SecurityAlertStatus>("PENDIENTE");
  const [statusComment, setStatusComment] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const chartCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Alertas activas", value: stats.active_alerts, icon: ShieldAlert },
      { label: "Pendientes", value: stats.pending, icon: Clock3 },
      { label: "Atendidas hoy", value: stats.attended_today, icon: CheckCircle2 },
      { label: "Cerradas hoy", value: stats.closed_today, icon: Siren },
      { label: "Total 30 días", value: stats.total_30_days, icon: AlertTriangle },
    ];
  }, [stats]);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [filters, page]);

  async function loadBaseData() {
    try {
      const [statsData, centersData] = await Promise.all([
        getSecurityAlertStats(),
        getEducationalCenters(),
      ]);
      setStats(statsData);
      if (Array.isArray(centersData)) {
        setCenters(centersData);
      }
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadAlerts() {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await getSecurityAlerts({
        ...filters,
        page,
        page_size: pageSize,
      });
      setAlerts(response.results);
      setTotalPages(response.total_pages);
      setCount(response.count);
      if (response.results.length > 0) {
        const activeId =
          selectedAlert && response.results.some((item) => item.id === selectedAlert.id)
            ? selectedAlert.id
            : response.results[0].id;
        await openAlert(activeId);
      } else {
        setSelectedAlert(null);
        setHistory(null);
      }
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

  async function openAlert(id: number) {
    setDetailLoading(true);
    try {
      const [detail, historyData] = await Promise.all([
        getSecurityAlertById(id),
        getSecurityAlertHistory(id),
      ]);
      setSelectedAlert(detail);
      setSelectedStatus(detail.status);
      setHistory(historyData);
    } catch (error) {
      handleApiError(error);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadBaseData(), loadAlerts()]);
  }

  async function saveStatus() {
    if (!selectedAlert) return;
    setSaving(true);
    try {
      await updateSecurityAlertStatus(selectedAlert.id, selectedStatus, statusComment);
      setStatusComment("");
      await Promise.all([loadBaseData(), loadAlerts(), openAlert(selectedAlert.id)]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      activeItem="Alertas de Seguridad"
      eyebrow="Gestión de seguridad"
      title="Gestionar Alertas de Seguridad"
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
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {chartCards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon className="h-5 w-5 text-sky" />
            </div>
            <p className="mt-4 text-4xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-sky" />
          <h3 className="text-lg font-bold text-slate-900">Filtros</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={draftFilters.search}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Buscar niño, código o descripción"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
          <select
            value={draftFilters.educational_center_id}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, educational_center_id: event.target.value }))
            }
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          >
            <option value="">Todos los centros</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
          <select
            value={draftFilters.alert_type}
            onChange={(event) => setDraftFilters((current) => ({ ...current, alert_type: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          >
            <option value="">Todos los tipos</option>
            <option value="SALIDA_AREA_SEGURA">Salida área segura</option>
            <option value="INGRESO_ZONA_RIESGO">Ingreso zona riesgo</option>
            <option value="ERROR_MONITOREO">Error monitoreo</option>
          </select>
          <select
            value={draftFilters.status}
            onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="ATENDIDA">Atendida</option>
            <option value="CERRADA">Cerrada</option>
          </select>
          <select
            value={draftFilters.priority}
            onChange={(event) => setDraftFilters((current) => ({ ...current, priority: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          >
            <option value="">Todas las prioridades</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BAJA">Baja</option>
          </select>
          <input
            type="date"
            value={draftFilters.date_from}
            onChange={(event) => setDraftFilters((current) => ({ ...current, date_from: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
          <input
            type="date"
            value={draftFilters.date_to}
            onChange={(event) => setDraftFilters((current) => ({ ...current, date_to: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setFilters(draftFilters);
              }}
              className="flex-1 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFilters(initialFilters);
                setFilters(initialFilters);
                setPage(1);
              }}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Listado</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Alertas registradas</h3>
            </div>
            <span className="rounded-full bg-slateBlue px-4 py-2 text-sm font-semibold text-slate-700">
              {count} total
            </span>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">ID / Código</th>
                  <th className="pb-3 font-medium">Fecha / Hora</th>
                  <th className="pb-3 font-medium">Niño</th>
                  <th className="pb-3 font-medium">Centro</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Prioridad</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium">Ubicación</th>
                  <th className="pb-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Cargando alertas...
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      No hay alertas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr key={alert.id} className="text-slate-700">
                      <td className="py-4">
                        <p className="font-semibold">{alert.id}</p>
                        <p className="text-xs text-slate-500">{alert.code}</p>
                      </td>
                      <td className="py-4">{formatDateTime(alert.event_datetime)}</td>
                      <td className="py-4">{alert.child.full_name}</td>
                      <td className="py-4">{alert.educational_center.name}</td>
                      <td className="py-4">{alert.alert_type}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityTone(alert.priority)}`}>
                          {alert.priority}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(alert.status)}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="py-4 text-xs text-slate-500">
                        {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openAlert(alert.id)}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Ver detalle
                          </button>
                          <button
                            type="button"
                            onClick={() => void openAlert(alert.id)}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Ver historial
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <p className="text-sm text-slate-500">
              Página {page} de {totalPages}
            </p>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Detalle lateral</p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">
              {selectedAlert ? selectedAlert.code : "Selecciona una alerta"}
            </h3>
            {detailLoading ? (
              <p className="mt-6 text-sm text-slate-500">Cargando detalle...</p>
            ) : selectedAlert ? (
              <div className="mt-6 space-y-4 text-sm text-slate-700">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slateBlue p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Niño</p>
                    <p className="mt-2 font-semibold">{selectedAlert.child.full_name}</p>
                  </div>
                  <div className="rounded-2xl bg-slateBlue p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Centro educativo</p>
                    <p className="mt-2 font-semibold">{selectedAlert.educational_center.name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p><span className="font-semibold">Tipo:</span> {selectedAlert.alert_type}</p>
                  <p><span className="font-semibold">Descripción:</span> {selectedAlert.description}</p>
                  <p><span className="font-semibold">Fecha / hora:</span> {formatDateTime(selectedAlert.event_datetime)}</p>
                  <p><span className="font-semibold">Prioridad:</span> {selectedAlert.priority}</p>
                  <p><span className="font-semibold">Estado:</span> {selectedAlert.status}</p>
                  <p><span className="font-semibold">Latitud:</span> {selectedAlert.latitude}</p>
                  <p><span className="font-semibold">Longitud:</span> {selectedAlert.longitude}</p>
                  <p><span className="font-semibold">Precisión GPS:</span> {selectedAlert.accuracy ?? "Sin dato"}</p>
                  <p><span className="font-semibold">Dispositivo GPS:</span> {selectedAlert.gps_device.code ?? "Sin dato"}</p>
                  <p><span className="font-semibold">Monitoreo:</span> {selectedAlert.monitoring.estado}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-800">
                    <MapPinned className="h-4 w-4 text-sky" />
                    <p className="font-semibold">Referencia visual</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Coordenadas: {selectedAlert.latitude.toFixed(6)}, {selectedAlert.longitude.toFixed(6)}
                  </p>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${selectedAlert.latitude}&mlon=${selectedAlert.longitude}#map=17/${selectedAlert.latitude}/${selectedAlert.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky"
                  >
                    Ver ubicación
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
                <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-900">Cambiar estado</p>
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as SecurityAlertStatus)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
                  >
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="ATENDIDA">ATENDIDA</option>
                    <option value="CERRADA">CERRADA</option>
                  </select>
                  <textarea
                    value={statusComment}
                    onChange={(event) => setStatusComment(event.target.value)}
                    placeholder="Observación del cambio"
                    className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
                  />
                  <button
                    type="button"
                    onClick={() => void saveStatus()}
                    disabled={saving}
                    className="w-full rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? "Actualizando..." : "Actualizar estado"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Selecciona una alerta de la tabla para ver su detalle.</p>
            )}
          </article>

          <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Historial</p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">Cambios registrados</h3>
            <div className="mt-5 space-y-3">
              {history?.history.length ? (
                history.history.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-800">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.previous_status ?? "N/A"} → {entry.new_status ?? "N/A"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{entry.comment || "Sin comentario."}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {entry.changed_by ?? "Sistema"} · {formatDateTime(entry.changed_at)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No hay historial disponible.</p>
              )}
            </div>
          </article>
        </aside>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Gráficos</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Distribución de alertas</h3>
          <div className="mt-6 space-y-4">
            {[
              { label: "Por tipo", values: stats?.by_type ?? {} },
              { label: "Por prioridad", values: stats?.by_priority ?? {} },
              { label: "Por estado", values: stats?.by_status ?? {} },
            ].map((group) => (
              <div key={group.label}>
                <p className="text-sm font-semibold text-slate-700">{group.label}</p>
                <div className="mt-3 space-y-3">
                  {Object.entries(group.values).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{key}</span>
                        <span>{value}</span>
                      </div>
                      <div className="mt-1 h-3 rounded-full bg-slate-100">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-sky to-navy"
                          style={{
                            width: `${stats && stats.total_30_days > 0 ? Math.max(8, (value / stats.total_30_days) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Reglas de generación</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Flujo automático</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slateBlue p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Reglas</p>
              <ul className="mt-3 space-y-2">
                <li>Se genera alerta al salir del área segura.</li>
                <li>Se genera alerta al ingresar a zona de riesgo.</li>
                <li>No se generan duplicados en 5 minutos.</li>
                <li>Solo niños y dispositivos activos.</li>
                <li>Se notifica a tutores asociados.</li>
                <li>Se registra historial de cada cambio.</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-navy p-5 text-sm text-slate-100">
              <p className="font-semibold text-white">Secuencia</p>
              <p className="mt-3 leading-7">
                Recepción GPS → Monitoreo → Generación alerta → Registro BD → Notificación → Seguimiento
              </p>
            </div>
          </div>
        </article>
      </section>
    </AdminShell>
  );
}

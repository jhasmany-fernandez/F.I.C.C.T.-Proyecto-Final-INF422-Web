"use client";

import {
  Eye,
  LocateFixed,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  Child,
  createGpsDevice,
  deleteGpsDevice,
  getChildren,
  getGpsDeviceById,
  getGpsDeviceHistory,
  getGpsDevicesAdmin,
  getGpsDeviceStats,
  GpsDevice,
  GpsDeviceDetail,
  GpsDeviceHistoryEntry,
  GpsDevicesResponse,
  GpsDeviceStats,
  updateGpsDevice,
  updateGpsDeviceStatus,
} from "@/lib/api";

type FilterState = {
  search: string;
  status: string;
  is_active: string;
  assigned: string;
  battery_low: string;
};

type FormState = {
  id?: number;
  code: string;
  serial_number: string;
  imei: string;
  phone_number: string;
  brand: string;
  model: string;
  status: string;
  battery_level: string;
  assigned_child_id: string;
  last_latitude: string;
  last_longitude: string;
  last_seen_at: string;
  is_active: boolean;
};

const initialFilters: FilterState = {
  search: "",
  status: "",
  is_active: "",
  assigned: "",
  battery_low: "",
};

const initialForm: FormState = {
  code: "",
  serial_number: "",
  imei: "",
  phone_number: "",
  brand: "",
  model: "",
  status: "DISPONIBLE",
  battery_level: "100",
  assigned_child_id: "",
  last_latitude: "",
  last_longitude: "",
  last_seen_at: "",
  is_active: true,
};

function formatDateTime(value?: string | null) {
  if (!value) return "Sin registro";
  return new Date(value).toLocaleString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error al procesar la solicitud.";
}

function statusTone(isActive: boolean) {
  return isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
}

function statusLabel(value?: string) {
  switch (value) {
    case "DISPONIBLE":
      return "Disponible";
    case "ASIGNADO":
      return "Asignado";
    case "EN_MANTENIMIENTO":
      return "En mantenimiento";
    case "PERDIDO":
      return "Perdido";
    case "INACTIVO":
      return "Inactivo";
    default:
      return value ?? "Sin estado";
  }
}

function normalizeDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function GpsDevicesShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [devicesData, setDevicesData] = useState<GpsDevicesResponse | null>(null);
  const [stats, setStats] = useState<GpsDeviceStats | null>(null);
  const [childrenOptions, setChildrenOptions] = useState<Child[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<GpsDeviceDetail | null>(null);
  const [deviceHistory, setDeviceHistory] = useState<GpsDeviceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [statusTarget, setStatusTarget] = useState<GpsDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GpsDevice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [filters, page, pageSize]);

  async function loadBaseData() {
    try {
      const [statsData, childrenData] = await Promise.all([
        getGpsDeviceStats(),
        getChildren({ page: 1, page_size: 100, status: "activo" }),
      ]);
      setStats(statsData);
      setChildrenOptions(childrenData.results ?? []);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function loadDevices() {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await getGpsDevicesAdmin({ ...filters, page, page_size: pageSize });
      setDevicesData(data);
      if (data.results.length > 0) {
        const nextId =
          selectedDevice && data.results.some((device) => device.id === selectedDevice.id)
            ? selectedDevice.id
            : data.results[0].id;
        const detail = await getGpsDeviceById(nextId);
        setSelectedDevice(detail);
      } else {
        setSelectedDevice(null);
      }
    } catch (error) {
      handleProtectedError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleProtectedError(error: unknown) {
    const message = getErrorMessage(error);
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
    if (status === 401) {
      clearSession();
      router.replace("/");
      return;
    }
    if (status === 403) {
      setErrorMessage("No tiene permisos para gestionar dispositivos GPS.");
      return;
    }
    setErrorMessage(message);
  }

  async function openDetail(deviceId: number) {
    try {
      const detail = await getGpsDeviceById(deviceId);
      setSelectedDevice(detail);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function openEditById(deviceId: number) {
    try {
      const detail = await getGpsDeviceById(deviceId);
      setSelectedDevice(detail);
      openEdit(detail);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function openHistory(deviceId: number) {
    try {
      const history = await getGpsDeviceHistory(deviceId);
      setDeviceHistory(history);
      setHistoryOpen(true);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormState(initialForm);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function openEdit(device: GpsDeviceDetail) {
    setFormMode("edit");
    setFormState({
      id: device.id,
      code: device.code ?? "",
      serial_number: device.serial_number ?? "",
      imei: device.imei ?? "",
      phone_number: device.phone_number ?? "",
      brand: device.brand ?? "",
      model: device.model ?? "",
      status: device.status ?? "DISPONIBLE",
      battery_level: String(device.battery_level ?? 100),
      assigned_child_id: device.assigned_child?.id ? String(device.assigned_child.id) : "",
      last_latitude: device.last_latitude != null ? String(device.last_latitude) : "",
      last_longitude: device.last_longitude != null ? String(device.last_longitude) : "",
      last_seen_at: normalizeDateTimeLocal(device.last_seen_at),
      is_active: Boolean(device.is_active),
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function submitDevice() {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!formState.code.trim()) {
      setSaving(false);
      setErrorMessage("El código es obligatorio.");
      return;
    }
    if (!formState.serial_number.trim()) {
      setSaving(false);
      setErrorMessage("El número de serie es obligatorio.");
      return;
    }
    if (!formState.imei.trim()) {
      setSaving(false);
      setErrorMessage("El IMEI es obligatorio.");
      return;
    }
    if (!formState.model.trim()) {
      setSaving(false);
      setErrorMessage("El modelo es obligatorio.");
      return;
    }

    try {
      const payload = {
        code: formState.code.trim(),
        serial_number: formState.serial_number.trim(),
        imei: formState.imei.trim(),
        phone_number: formState.phone_number.trim(),
        brand: formState.brand.trim(),
        model: formState.model.trim(),
        status: formState.status,
        battery_level: Number(formState.battery_level || "0"),
        assigned_child_id: formState.assigned_child_id ? Number(formState.assigned_child_id) : null,
        last_latitude: formState.last_latitude ? Number(formState.last_latitude) : null,
        last_longitude: formState.last_longitude ? Number(formState.last_longitude) : null,
        last_seen_at: formState.last_seen_at ? new Date(formState.last_seen_at).toISOString() : null,
        is_active: formState.is_active,
      };

      const detail =
        formMode === "edit" && formState.id
          ? await updateGpsDevice(formState.id, payload)
          : await createGpsDevice(payload);

      setSelectedDevice(detail);
      setFormMode(null);
      setSuccessMessage(formMode === "edit" ? "Dispositivo actualizado correctamente." : "Dispositivo creado correctamente.");
      await Promise.all([loadBaseData(), loadDevices()]);
    } catch (error) {
      handleProtectedError(error);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!statusTarget) return;
    try {
      const nextActive = !statusTarget.is_active;
      const detail = await updateGpsDeviceStatus(statusTarget.id, {
        status: nextActive ? "DISPONIBLE" : "INACTIVO",
        is_active: nextActive,
      });
      setSelectedDevice(detail);
      setStatusTarget(null);
      setSuccessMessage(nextActive ? "Dispositivo activado correctamente." : "Dispositivo inactivado correctamente.");
      await Promise.all([loadBaseData(), loadDevices()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function removeDevice() {
    if (!deleteTarget) return;
    try {
      const response = await deleteGpsDevice(deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage(response.message ?? "Dispositivo inactivado correctamente.");
      await Promise.all([loadBaseData(), loadDevices()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  const metrics = [
    ["Total dispositivos", stats?.total_dispositivos ?? 0],
    ["Disponibles", stats?.disponibles ?? 0],
    ["Asignados", stats?.asignados ?? 0],
    ["Mantenimiento", stats?.en_mantenimiento ?? 0],
    ["Perdidos", stats?.perdidos ?? 0],
    ["Batería baja", stats?.bateria_baja ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Dispositivos GPS"
      eyebrow="Administración / Dispositivos GPS"
      title="Gestión de Dispositivos GPS"
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo dispositivo
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <article key={label} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      {(errorMessage || successMessage) && (
        <section
          className={`mt-6 rounded-[1.5rem] border px-5 py-4 text-sm ${
            errorMessage
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || successMessage}
        </section>
      )}

      <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Operación</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Control operativo de rastreadores</h3>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={draftFilters.search}
                onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar por código, IMEI o marca"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white md:w-72"
              />
            </div>
            <select
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="ASIGNADO">Asignado</option>
              <option value="EN_MANTENIMIENTO">En mantenimiento</option>
              <option value="PERDIDO">Perdido</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
            <select
              value={draftFilters.is_active}
              onChange={(event) => setDraftFilters((current) => ({ ...current, is_active: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Activo e inactivo</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
            <select
              value={draftFilters.assigned}
              onChange={(event) => setDraftFilters((current) => ({ ...current, assigned: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Asignado y libre</option>
              <option value="true">Asignados</option>
              <option value="false">Sin asignar</option>
            </select>
            <select
              value={draftFilters.battery_low}
              onChange={(event) => setDraftFilters((current) => ({ ...current, battery_low: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Cualquier batería</option>
              <option value="true">Batería baja</option>
              <option value="false">Batería normal</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setFilters(draftFilters);
                setPage(1);
              }}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <article className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Listado</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Dispositivos GPS</h3>
            </div>
            <select
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>

          {loading ? (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">
              Cargando dispositivos...
            </div>
          ) : devicesData?.results?.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-4 font-medium">Dispositivo</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Batería</th>
                    <th className="pb-4 font-medium">Asignación</th>
                    <th className="pb-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {devicesData.results.map((device) => (
                    <tr key={device.id} className="border-t border-slate-100">
                      <td className="py-4">
                        <button type="button" onClick={() => void openDetail(device.id)} className="text-left">
                          <p className="font-semibold text-slate-900">{device.code}</p>
                          <p className="text-xs text-slate-500">{device.brand} {device.model}</p>
                        </button>
                      </td>
                      <td className="py-4">{statusLabel(device.status)}</td>
                      <td className="py-4">
                        <span className={device.battery_level <= 20 ? "text-amber-600 font-semibold" : ""}>
                          {device.battery_level}%
                        </span>
                      </td>
                      <td className="py-4">{device.assigned_child?.nombre_completo ?? "Sin asignar"}</td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => void openHistory(device.id)} className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
                            <Wrench className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void openDetail(device.id)} className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void openEditById(device.id)} className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center">
              <LocateFixed className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-4 text-lg font-semibold text-slate-900">No hay dispositivos para mostrar</p>
              <p className="mt-2 text-sm text-slate-500">Ajusta los filtros o registra un nuevo GPS.</p>
            </div>
          )}
        </article>

        <aside className="rounded-[2rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Detalle</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">Ficha del dispositivo</h3>
          {selectedDevice ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-slate-900">{selectedDevice.code}</p>
                    <p className="mt-1 text-sm text-slate-500">{selectedDevice.brand} {selectedDevice.model}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(Boolean(selectedDevice.is_active))}`}>
                    {selectedDevice.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-900">Estado:</span> {statusLabel(selectedDevice.status)}</p>
                  <p><span className="font-semibold text-slate-900">IMEI:</span> {selectedDevice.imei}</p>
                  <p><span className="font-semibold text-slate-900">Serie:</span> {selectedDevice.serial_number}</p>
                  <p><span className="font-semibold text-slate-900">Batería:</span> {selectedDevice.battery_level}%</p>
                  <p><span className="font-semibold text-slate-900">Niño asignado:</span> {selectedDevice.assigned_child?.nombre_completo ?? "Sin asignar"}</p>
                  <p><span className="font-semibold text-slate-900">Última conexión:</span> {formatDateTime(selectedDevice.last_seen_at)}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <button type="button" onClick={() => openEdit(selectedDevice)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <Pencil className="h-4 w-4" />
                  Editar dispositivo
                </button>
                <button type="button" onClick={() => setStatusTarget(selectedDevice)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <UserCheck className="h-4 w-4" />
                  {selectedDevice.is_active ? "Inactivar" : "Activar"}
                </button>
                <button type="button" onClick={() => setDeleteTarget(selectedDevice)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                  Eliminar controlado
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">
              Selecciona un dispositivo para ver su detalle.
            </div>
          )}
        </aside>
      </section>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-10">
          <div className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">CU16 WEB</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">{formMode === "create" ? "Nuevo dispositivo GPS" : "Editar dispositivo GPS"}</h3>
              </div>
              <button type="button" onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {[
                ["code", "Código"],
                ["serial_number", "Número de serie"],
                ["imei", "IMEI"],
                ["phone_number", "Teléfono/SIM"],
                ["brand", "Marca"],
                ["model", "Modelo"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
                  <input
                    value={formState[key as keyof FormState] as string}
                    onChange={(event) => setFormState((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Estado</span>
                <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white">
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="ASIGNADO">Asignado</option>
                  <option value="EN_MANTENIMIENTO">En mantenimiento</option>
                  <option value="PERDIDO">Perdido</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Batería</span>
                <input type="number" min="0" max="100" value={formState.battery_level} onChange={(event) => setFormState((current) => ({ ...current, battery_level: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Niño asignado</span>
                <select value={formState.assigned_child_id} onChange={(event) => setFormState((current) => ({ ...current, assigned_child_id: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white">
                  <option value="">Sin asignar</option>
                  {childrenOptions.map((child) => (
                    <option key={child.id} value={String(child.id)}>
                      {child.nombres} {child.apellidos} - {child.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Última latitud</span>
                <input value={formState.last_latitude} onChange={(event) => setFormState((current) => ({ ...current, last_latitude: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Última longitud</span>
                <input value={formState.last_longitude} onChange={(event) => setFormState((current) => ({ ...current, last_longitude: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Última conexión</span>
                <input type="datetime-local" value={formState.last_seen_at} onChange={(event) => setFormState((current) => ({ ...current, last_seen_at: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white" />
              </label>
              <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={formState.is_active} onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-sky focus:ring-sky" />
                Dispositivo activo
              </label>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => void submitDevice()} disabled={saving} className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? "Guardando..." : formMode === "create" ? "Crear dispositivo" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-10">
          <div className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">Historial</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Eventos del dispositivo</h3>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {deviceHistory.length ? deviceHistory.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.detail || "Sin detalle adicional."}</p>
                </article>
              )) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-12 text-center text-slate-500">
                  No hay historial disponible para este dispositivo.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">{statusTarget.is_active ? "Inactivar dispositivo" : "Activar dispositivo"}</h3>
            <p className="mt-3 text-sm text-slate-600">
              {statusTarget.is_active ? "El dispositivo dejará de estar disponible en operaciones activas." : "El dispositivo volverá a estar disponible para uso administrativo."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setStatusTarget(null)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => void changeStatus()} className="rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90">Confirmar</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Eliminar controlado</h3>
            <p className="mt-3 text-sm text-slate-600">El dispositivo se inactivará de forma lógica y quedará fuera del flujo operativo.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => void removeDevice()} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">Inactivar</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

"use client";

import {
  CalendarDays,
  CircleAlert,
  Eye,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  Child,
  ChildPayload,
  ChildrenResponse,
  ChildrenStats,
  EducationalCenter,
  GpsDevice,
  createChild,
  deleteChild,
  getChildById,
  getChildren,
  getChildrenStats,
  getEducationalCenters,
  getGpsDevices,
  updateChild,
  updateChildStatus,
} from "@/lib/api";

type Filters = {
  search: string;
  centro_educativo: string;
  curso: string;
  status: string;
  dispositivo_gps: string;
  fecha_registro: string;
};

type FormState = {
  id?: number;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  curso: string;
  centro_educativo_id: string;
  dispositivo_gps_id: string;
  status: "activo" | "inactivo";
  motivo_desactivacion: string;
  foto: File | null;
};

const initialFilters: Filters = {
  search: "",
  centro_educativo: "",
  curso: "",
  status: "",
  dispositivo_gps: "",
  fecha_registro: "",
};

const initialForm: FormState = {
  nombres: "",
  apellidos: "",
  fecha_nacimiento: "",
  curso: "",
  centro_educativo_id: "",
  dispositivo_gps_id: "",
  status: "activo",
  motivo_desactivacion: "",
  foto: null,
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function calculateAge(dateValue: string) {
  if (!dateValue) {
    return 0;
  }
  const birthDate = new Date(dateValue);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Error al guardar. Intente nuevamente.";
}

export function ChildrenMonitoringShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [childrenData, setChildrenData] = useState<ChildrenResponse | null>(null);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [stats, setStats] = useState<ChildrenStats | null>(null);
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [gpsDevices, setGpsDevices] = useState<GpsDevice[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [statusModalChild, setStatusModalChild] = useState<Child | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const selectedDevice = useMemo(
    () => gpsDevices.find((device) => String(device.id) === formState.dispositivo_gps_id) ?? null,
    [gpsDevices, formState.dispositivo_gps_id],
  );

  useEffect(() => {
    void loadBaseCatalogs();
  }, []);

  useEffect(() => {
    void loadChildren();
  }, [filters, page, pageSize]);

  async function loadBaseCatalogs() {
    try {
      const [centersData, gpsData, statsData] = await Promise.all([
        getEducationalCenters(),
        getGpsDevices(),
        getChildrenStats(),
      ]);
      setCenters(Array.isArray(centersData) ? centersData : centersData.results ?? []);
      setGpsDevices(gpsData);
      setStats(statsData);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadChildren() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getChildren({
        ...filters,
        page,
        page_size: pageSize,
      });
      setChildrenData(data);

      if (data.results.length > 0) {
        const childId =
          selectedChild && data.results.some((child: Child) => child.id === selectedChild.id) ? selectedChild.id : data.results[0].id;
        const detail = await getChildById(childId);
        setSelectedChild(detail);
      } else {
        setSelectedChild(null);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleApiError(error: unknown) {
    const message = normalizeError(error);
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
    if (status === 401 || status === 403) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(message);
  }

  async function openChildDetail(id: number) {
    try {
      const detail = await getChildById(id);
      setSelectedChild(detail);
      setFormMode(null);
      setErrorMessage("");
    } catch (error) {
      handleApiError(error);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormState(initialForm);
    setErrorMessage("");
  }

  function openEdit(child: Child) {
    setFormMode("edit");
    setFormState({
      id: child.id,
      nombres: child.nombres,
      apellidos: child.apellidos,
      fecha_nacimiento: child.fecha_nacimiento,
      curso: child.curso,
      centro_educativo_id: String(child.centro_educativo.id),
      dispositivo_gps_id: child.dispositivo_gps ? String(child.dispositivo_gps.id) : "",
      status: child.status,
      motivo_desactivacion: child.motivo_desactivacion,
      foto: null,
    });
    setErrorMessage("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFormState((current) => ({ ...current, foto: null }));
      return;
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErrorMessage("La foto debe ser JPG o PNG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("La foto no puede exceder 2 MB.");
      return;
    }

    setFormState((current) => ({ ...current, foto: file }));
    setErrorMessage("");
  }

  async function submitChild() {
    setSaving(true);
    setErrorMessage("");

    if (!formState.nombres.trim()) {
      setSaving(false);
      setErrorMessage("Los nombres son obligatorios.");
      return;
    }
    if (!formState.apellidos.trim()) {
      setSaving(false);
      setErrorMessage("Los apellidos son obligatorios.");
      return;
    }
    if (!formState.fecha_nacimiento) {
      setSaving(false);
      setErrorMessage("La fecha de nacimiento es obligatoria.");
      return;
    }
    if (!formState.curso.trim()) {
      setSaving(false);
      setErrorMessage("El curso es obligatorio.");
      return;
    }
    if (!formState.centro_educativo_id) {
      setSaving(false);
      setErrorMessage("El centro educativo es obligatorio.");
      return;
    }

    const payload: ChildPayload = {
      nombres: formState.nombres.trim(),
      apellidos: formState.apellidos.trim(),
      fecha_nacimiento: formState.fecha_nacimiento,
      curso: formState.curso.trim(),
      centro_educativo_id: Number(formState.centro_educativo_id),
      dispositivo_gps_id: formState.dispositivo_gps_id ? Number(formState.dispositivo_gps_id) : null,
      status: formState.status,
      motivo_desactivacion: formState.motivo_desactivacion.trim(),
      foto: formState.foto,
    };

    try {
      const saved =
        formMode === "edit" && formState.id ? await updateChild(formState.id, payload) : await createChild(payload);
      setSelectedChild(saved);
      setFormMode(null);
      await Promise.all([loadChildren(), loadBaseCatalogs()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!statusModalChild) {
      return;
    }
    try {
      const nextStatus = statusModalChild.status === "activo" ? "inactivo" : "activo";
      const updated = await updateChildStatus(statusModalChild.id, nextStatus, formState.motivo_desactivacion.trim());
      setSelectedChild(updated);
      setStatusModalChild(null);
      setFormState((current) => ({ ...current, motivo_desactivacion: "" }));
      await Promise.all([loadChildren(), loadBaseCatalogs()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteChild(id);
      if (selectedChild?.id === id) {
        setSelectedChild(null);
      }
      await Promise.all([loadChildren(), loadBaseCatalogs()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setDeletingId(null);
    }
  }

  const summaryCards = [
    ["Total Niños", stats?.total_ninos ?? 0],
    ["Activos", stats?.activos ?? 0],
    ["Inactivos", stats?.inactivos ?? 0],
    ["Con GPS Asignado", stats?.con_gps_asignado ?? 0],
    ["Sin GPS Asignado", stats?.sin_gps_asignado ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Niños Monitoreados"
      eyebrow="Monitoreo escolar"
      title="Gestión de Niños Monitoreados"
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky"
        >
          <Plus className="h-4 w-4" />
          Nuevo Niño
        </button>
      }
    >
      <p className="-mt-5 mb-6 text-sm leading-6 text-slate-500">
        Administra la información de los niños que serán monitoreados en el sistema.
      </p>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => (
          <article key={label} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-4 text-4xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      {errorMessage ? (
        <section className="mt-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="mt-6 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
          <input
            value={draftFilters.search}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Buscar por nombre, apellido o código"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          />
          <select
            value={draftFilters.centro_educativo}
            onChange={(event) => setDraftFilters((current) => ({ ...current, centro_educativo: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">Centro educativo</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
          <input
            value={draftFilters.curso}
            onChange={(event) => setDraftFilters((current) => ({ ...current, curso: event.target.value }))}
            placeholder="Curso"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          />
          <select
            value={draftFilters.status}
            onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">Estado</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
          <select
            value={draftFilters.dispositivo_gps}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dispositivo_gps: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">GPS</option>
            <option value="none">Sin GPS</option>
            {gpsDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.code}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draftFilters.fecha_registro}
            onChange={(event) => setDraftFilters((current) => ({ ...current, fecha_registro: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => {
              setPage(1);
              setFilters(draftFilters);
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy"
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
          <button
            onClick={() => {
              setDraftFilters(initialFilters);
              setFilters(initialFilters);
              setPage(1);
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Limpiar
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-4 font-medium">Foto</th>
                  <th className="pb-4 font-medium">ID</th>
                  <th className="pb-4 font-medium">Nombre del Niño</th>
                  <th className="pb-4 font-medium">Fecha Nacimiento</th>
                  <th className="pb-4 font-medium">Edad</th>
                  <th className="pb-4 font-medium">Curso</th>
                  <th className="pb-4 font-medium">Centro Educativo</th>
                  <th className="pb-4 font-medium">Dispositivo GPS</th>
                  <th className="pb-4 font-medium">Estado</th>
                  <th className="pb-4 font-medium">Fecha Registro</th>
                  <th className="pb-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={11} className="py-8 text-center text-slate-500">Cargando niños monitoreados...</td></tr>
                ) : childrenData?.results.length ? (
                  childrenData.results.map((child: Child) => (
                    <tr key={child.id} className="text-slate-700">
                      <td className="py-4">
                        {child.foto_url ? (
                          <Image src={child.foto_url} alt={child.nombre_completo} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slateBlue text-slate-500">
                            <UserRound className="h-5 w-5" />
                          </div>
                        )}
                      </td>
                      <td className="py-4 font-semibold">{child.code}</td>
                      <td className="py-4 font-semibold">{child.nombre_completo}</td>
                      <td className="py-4">{formatDate(child.fecha_nacimiento)}</td>
                      <td className="py-4">{child.edad}</td>
                      <td className="py-4">{child.curso}</td>
                      <td className="py-4">{child.centro_educativo.name}</td>
                      <td className="py-4">{child.dispositivo_gps?.code ?? "Sin asignar"}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${child.status === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                          {child.status}
                        </span>
                      </td>
                      <td className="py-4">{formatDate(child.fecha_registro)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void openChildDetail(child.id)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              void getChildById(child.id).then(openEdit).catch(handleApiError);
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setStatusModalChild(child)}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          >
                            <CircleAlert className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void handleDelete(child.id)}
                            disabled={deletingId === child.id}
                            className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={11} className="py-8 text-center text-slate-500">No se encontraron registros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-100 px-4 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <p>
              Mostrando {childrenData?.results.length ?? 0} registros visibles de {childrenData?.count ?? 0}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2"
              >
                {[5, 10, 20].map((size) => (
                  <option key={size} value={size}>{size} por página</option>
                ))}
              </select>
              <button
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>Página {childrenData?.page ?? 1} de {childrenData?.total_pages ?? 1}</span>
              <button
                onClick={() => setPage((current) => Math.min(current + 1, childrenData?.total_pages ?? 1))}
                disabled={page >= (childrenData?.total_pages ?? 1)}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {formMode === "create" ? "Registrar Nuevo Niño" : formMode === "edit" ? "Editar Niño" : "Detalle del Niño"}
              </h3>
              {formMode ? (
                <button onClick={() => setFormMode(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {formMode ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Nombres *</label>
                    <input value={formState.nombres} onChange={(e) => setFormState((c) => ({ ...c, nombres: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Apellidos *</label>
                    <input value={formState.apellidos} onChange={(e) => setFormState((c) => ({ ...c, apellidos: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Fecha de nacimiento *</label>
                    <input type="date" value={formState.fecha_nacimiento} onChange={(e) => setFormState((c) => ({ ...c, fecha_nacimiento: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Edad calculada automáticamente</label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {calculateAge(formState.fecha_nacimiento)} años
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Curso *</label>
                    <input value={formState.curso} onChange={(e) => setFormState((c) => ({ ...c, curso: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Centro educativo *</label>
                    <select value={formState.centro_educativo_id} onChange={(e) => setFormState((c) => ({ ...c, centro_educativo_id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
                      <option value="">Seleccione</option>
                      {centers.map((center) => (
                        <option key={center.id} value={center.id}>{center.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Dispositivo GPS</label>
                    <select value={formState.dispositivo_gps_id} onChange={(e) => setFormState((c) => ({ ...c, dispositivo_gps_id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
                      <option value="">Seleccione</option>
                      {gpsDevices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.code} - {device.assignment_status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Estado *</label>
                    <select value={formState.status} onChange={(e) => setFormState((c) => ({ ...c, status: e.target.value as "activo" | "inactivo" }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Foto opcional</label>
                  <input type="file" accept="image/png,image/jpeg" onChange={onFileChange} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
                </div>

                <div className="rounded-[1.5rem] border border-sky/20 bg-sky/5 p-4">
                  <p className="text-sm font-semibold text-slate-800">Asignación de Dispositivo GPS</p>
                  <p className="mt-2 text-sm text-slate-600">
                    El dispositivo GPS debe estar registrado previamente en el módulo de Dispositivos GPS.
                  </p>
                  {selectedDevice ? (
                    <div className="mt-4 grid gap-2 text-sm text-slate-700">
                      <p><span className="font-semibold">Código:</span> {selectedDevice.code}</p>
                      <p><span className="font-semibold">Modelo:</span> {selectedDevice.model}</p>
                      <p><span className="font-semibold">IMEI:</span> {selectedDevice.imei}</p>
                      <p><span className="font-semibold">Estado del dispositivo:</span> {selectedDevice.is_active ? "Activo" : "Inactivo"}</p>
                      <p><span className="font-semibold">Estado de asignación:</span> {selectedDevice.assignment_status}</p>
                      <button type="button" className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                        Ver dispositivo
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setFormMode(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    Cancelar
                  </button>
                  <button onClick={() => void submitChild()} disabled={saving} className="flex-1 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-sky disabled:opacity-70">
                    {saving ? "Guardando..." : formMode === "edit" ? "Actualizar Niño" : "Guardar Niño"}
                  </button>
                </div>
              </div>
            ) : selectedChild ? (
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-4">
                  {selectedChild.foto_url ? (
                    <Image src={selectedChild.foto_url} alt={selectedChild.nombre_completo} width={72} height={72} className="h-[72px] w-[72px] rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-slateBlue text-slate-500">
                      <UserRound className="h-8 w-8" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-2xl font-bold text-slate-900">{selectedChild.nombre_completo}</h4>
                    <p className="text-sm text-slate-500">{selectedChild.code}</p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedChild.status === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {selectedChild.status}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-slate-700">
                  <p><span className="font-semibold">Nombres:</span> {selectedChild.nombres}</p>
                  <p><span className="font-semibold">Apellidos:</span> {selectedChild.apellidos}</p>
                  <p><span className="font-semibold">Fecha de nacimiento:</span> {formatDate(selectedChild.fecha_nacimiento)}</p>
                  <p><span className="font-semibold">Edad:</span> {selectedChild.edad}</p>
                  <p><span className="font-semibold">Curso:</span> {selectedChild.curso}</p>
                  <p><span className="font-semibold">Centro educativo:</span> {selectedChild.centro_educativo.name}</p>
                  <p><span className="font-semibold">Dispositivo GPS:</span> {selectedChild.dispositivo_gps?.code ?? "Sin asignar"}</p>
                  <p><span className="font-semibold">Estado:</span> {selectedChild.status}</p>
                  <p><span className="font-semibold">Fecha de registro:</span> {formatDate(selectedChild.fecha_registro)}</p>
                  <p><span className="font-semibold">Última actualización:</span> {formatDate(selectedChild.fecha_actualizacion)}</p>
                  {selectedChild.motivo_desactivacion ? (
                    <p><span className="font-semibold">Motivo de desactivación:</span> {selectedChild.motivo_desactivacion}</p>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => openEdit(selectedChild)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    Editar
                  </button>
                  <button onClick={() => setSelectedChild(null)} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-slate-500">Seleccione un niño para ver el detalle.</div>
            )}
          </article>
        </aside>
      </section>

      {statusModalChild ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {statusModalChild.status === "activo" ? "Desactivar Niño" : "Activar Niño"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {statusModalChild.status === "activo"
                    ? `¿Deseas desactivar a ${statusModalChild.nombre_completo}? No se eliminará su historial.`
                    : `¿Deseas activar nuevamente a ${statusModalChild.nombre_completo}?`}
                </p>
              </div>
            </div>

            {statusModalChild.status === "activo" ? (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Motivo opcional</label>
                <textarea
                  rows={4}
                  value={formState.motivo_desactivacion}
                  onChange={(event) => setFormState((current) => ({ ...current, motivo_desactivacion: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
                />
                <p className="mt-2 text-xs text-slate-400">{formState.motivo_desactivacion.length}/200</p>
              </div>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStatusModalChild(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Cancelar
              </button>
              <button onClick={() => void handleStatusChange()} className="flex-1 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white">
                {statusModalChild.status === "activo" ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

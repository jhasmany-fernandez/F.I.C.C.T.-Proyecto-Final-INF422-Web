"use client";

import {
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserCog,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  createRegent,
  deleteRegent,
  getRegentById,
  getRegentEducationalCenters,
  getRegentStats,
  getRegents,
  RegentDetail,
  RegentEducationalCenter,
  RegentListItem,
  RegentsResponse,
  RegentsStats,
  updateRegent,
  updateRegentStatus,
} from "@/lib/api";

type FilterState = {
  search: string;
  educational_center_id: string;
  is_active: string;
};

type FormState = {
  id?: number;
  email: string;
  nombre: string;
  apellidos: string;
  educational_center_id: string;
  is_active: boolean;
  password: string;
};

const initialFilters: FilterState = {
  search: "",
  educational_center_id: "",
  is_active: "",
};

const initialForm: FormState = {
  email: "",
  nombre: "",
  apellidos: "",
  educational_center_id: "",
  is_active: true,
  password: "",
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sin registro";
  }
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegentsShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [regentsData, setRegentsData] = useState<RegentsResponse | null>(null);
  const [stats, setStats] = useState<RegentsStats | null>(null);
  const [centers, setCenters] = useState<RegentEducationalCenter[]>([]);
  const [selectedRegent, setSelectedRegent] = useState<RegentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [statusTarget, setStatusTarget] = useState<RegentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegentListItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadRegents();
  }, [filters, page, pageSize]);

  async function loadBaseData() {
    try {
      const [statsData, centersData] = await Promise.all([getRegentStats(), getRegentEducationalCenters()]);
      setStats(statsData);
      setCenters(centersData);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function loadRegents() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getRegents({ ...filters, page, page_size: pageSize });
      setRegentsData(data);

      if (data.results.length > 0) {
        const nextId =
          selectedRegent && data.results.some((regent) => regent.id === selectedRegent.id)
            ? selectedRegent.id
            : data.results[0].id;
        const detail = await getRegentById(nextId);
        setSelectedRegent(detail);
      } else {
        setSelectedRegent(null);
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
      setErrorMessage("No tiene permisos para gestionar regentes.");
      return;
    }

    setErrorMessage(message);
  }

  async function openDetail(regentId: number) {
    try {
      const detail = await getRegentById(regentId);
      setSelectedRegent(detail);
      setErrorMessage("");
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function openEditById(regentId: number) {
    try {
      const detail = await getRegentById(regentId);
      setSelectedRegent(detail);
      openEdit(detail);
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

  function openEdit(regent: RegentDetail) {
    setFormMode("edit");
    setFormState({
      id: regent.id,
      email: regent.email ?? "",
      nombre: regent.nombre ?? "",
      apellidos: regent.apellidos ?? "",
      educational_center_id: regent.educational_center?.id ? String(regent.educational_center.id) : "",
      is_active: Boolean(regent.is_active),
      password: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function submitRegent() {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!formState.email.trim()) {
      setSaving(false);
      setErrorMessage("El correo electrónico es obligatorio.");
      return;
    }
    if (!isValidEmail(formState.email.trim())) {
      setSaving(false);
      setErrorMessage("Ingrese un correo electrónico válido.");
      return;
    }
    if (!formState.nombre.trim()) {
      setSaving(false);
      setErrorMessage("El nombre es obligatorio.");
      return;
    }
    if (!formState.apellidos.trim()) {
      setSaving(false);
      setErrorMessage("Los apellidos son obligatorios.");
      return;
    }
    if (!formState.educational_center_id) {
      setSaving(false);
      setErrorMessage("El centro educativo es obligatorio.");
      return;
    }
    if (formMode === "create" && !formState.password) {
      setSaving(false);
      setErrorMessage("La contraseña es obligatoria al crear.");
      return;
    }

    try {
      const payload = {
        email: formState.email.trim().toLowerCase(),
        nombre: formState.nombre.trim(),
        apellidos: formState.apellidos.trim(),
        educational_center_id: Number(formState.educational_center_id),
        is_active: formState.is_active,
        ...(formState.password ? { password: formState.password } : {}),
      };

      const detail =
        formMode === "edit" && formState.id
          ? await updateRegent(formState.id, payload)
          : await createRegent(payload);

      setSelectedRegent(detail);
      setFormMode(null);
      setSuccessMessage(formMode === "edit" ? "Regente actualizado correctamente." : "Regente creado correctamente.");
      await Promise.all([loadBaseData(), loadRegents()]);
    } catch (error) {
      handleProtectedError(error);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!statusTarget) {
      return;
    }

    try {
      const detail = await updateRegentStatus(statusTarget.id, !statusTarget.is_active);
      setSelectedRegent(detail);
      setStatusTarget(null);
      setSuccessMessage(detail.is_active ? "Regente activado correctamente." : "Regente inactivado correctamente.");
      await Promise.all([loadBaseData(), loadRegents()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function removeRegent() {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await deleteRegent(deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage(response.message ?? "Regente inactivado correctamente.");
      await Promise.all([loadBaseData(), loadRegents()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  const metrics = [
    ["Total regentes", stats?.total_regentes ?? 0],
    ["Activos", stats?.activos ?? 0],
    ["Inactivos", stats?.inactivos ?? 0],
    ["Centros con regente", stats?.centros_con_regente ?? 0],
    ["Centros sin regente", stats?.centros_sin_regente ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Regentes"
      eyebrow="Administración / Regentes"
      title="Gestión de Regentes"
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo regente
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
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Regentes y centros educativos</h3>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={draftFilters.search}
                onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar por nombre o email"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white md:w-72"
              />
            </div>
            <select
              value={draftFilters.educational_center_id}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, educational_center_id: event.target.value }))
              }
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Todos los centros</option>
              {centers.map((center) => (
                <option key={center.id} value={String(center.id)}>
                  {center.name}
                </option>
              ))}
            </select>
            <select
              value={draftFilters.is_active}
              onChange={(event) => setDraftFilters((current) => ({ ...current, is_active: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
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
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Regentes registrados</h3>
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
              Cargando regentes...
            </div>
          ) : regentsData?.results?.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-4 font-medium">Regente</th>
                    <th className="pb-4 font-medium">Centro</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Último acceso</th>
                    <th className="pb-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {regentsData.results.map((regent) => (
                    <tr key={regent.id} className="border-t border-slate-100">
                      <td className="py-4">
                        <button type="button" onClick={() => void openDetail(regent.id)} className="text-left">
                          <p className="font-semibold text-slate-900">
                            {regent.nombre} {regent.apellidos ?? ""}
                          </p>
                          <p className="text-xs text-slate-500">{regent.email}</p>
                        </button>
                      </td>
                      <td className="py-4">
                        <p className="font-medium text-slate-700">
                          {regent.educational_center?.name ?? "Sin centro asignado"}
                        </p>
                        <p className="text-xs text-slate-500">{regent.educational_center?.code ?? ""}</p>
                      </td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(Boolean(regent.is_active))}`}>
                          {regent.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-4">{formatDateTime(regent.last_login)}</td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(regent.id)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEditById(regent.id)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Página {regentsData.page ?? page} de {regentsData.total_pages ?? 1}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= Number(regentsData.total_pages ?? 1)}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center">
              <UserCog className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-4 text-lg font-semibold text-slate-900">No hay regentes para mostrar</p>
              <p className="mt-2 text-sm text-slate-500">Ajusta los filtros o registra un nuevo regente.</p>
            </div>
          )}
        </article>

        <aside className="rounded-[2rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Detalle</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">Información del regente</h3>

          {selectedRegent ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-slate-900">
                      {selectedRegent.nombre} {selectedRegent.apellidos ?? ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{selectedRegent.email}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(Boolean(selectedRegent.is_active))}`}>
                    {selectedRegent.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-900">Rol:</span> {selectedRegent.role?.name ?? selectedRegent.rol}</p>
                  <p><span className="font-semibold text-slate-900">Centro educativo:</span> {selectedRegent.educational_center?.name ?? "Sin centro asignado"}</p>
                  <p><span className="font-semibold text-slate-900">Código centro:</span> {selectedRegent.educational_center?.code ?? "Sin registro"}</p>
                  <p><span className="font-semibold text-slate-900">Fecha de registro:</span> {formatDateTime(selectedRegent.date_joined)}</p>
                  <p><span className="font-semibold text-slate-900">Último acceso:</span> {formatDateTime(selectedRegent.last_login)}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(selectedRegent)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" />
                  Editar regente
                </button>
                <button
                  type="button"
                  onClick={() => setStatusTarget(selectedRegent)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <UserCheck className="h-4 w-4" />
                  {selectedRegent.is_active ? "Inactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(selectedRegent)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Baja lógica
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">
              Selecciona un regente para ver su detalle.
            </div>
          )}
        </aside>
      </section>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-10">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">CU15 WEB</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  {formMode === "create" ? "Nuevo regente" : "Editar regente"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Correo electrónico</span>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Nombre</span>
                <input
                  value={formState.nombre}
                  onChange={(event) => setFormState((current) => ({ ...current, nombre: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Apellidos</span>
                <input
                  value={formState.apellidos}
                  onChange={(event) => setFormState((current) => ({ ...current, apellidos: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Centro educativo</span>
                <select
                  value={formState.educational_center_id}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, educational_center_id: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                >
                  <option value="">Seleccione un centro</option>
                  {centers.map((center) => (
                    <option key={center.id} value={String(center.id)}>
                      {center.code} - {center.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  {formMode === "create" ? "Contraseña" : "Nueva contraseña (opcional)"}
                </span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                />
              </label>
              <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formState.is_active}
                  onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-sky focus:ring-sky"
                />
                Regente activo
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitRegent()}
                disabled={saving}
                className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Guardando..." : formMode === "create" ? "Crear regente" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              {statusTarget.is_active ? "Inactivar regente" : "Activar regente"}
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              {statusTarget.is_active
                ? "El regente dejará de tener acceso al sistema hasta que vuelva a activarse."
                : "El regente recuperará su acceso al sistema."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void changeStatus()}
                className="rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Inactivar regente</h3>
            <p className="mt-3 text-sm text-slate-600">
              Esta acción aplicará una baja lógica al regente seleccionado.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void removeRegent()}
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Inactivar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

"use client";

import {
  Building2,
  Eye,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ToggleLeft,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  EducationalCenter,
  EducationalCenterPayload,
  EducationalCenterStats,
  EducationalCentersResponse,
  RegentOption,
  createEducationalCenter,
  deleteEducationalCenter,
  getEducationalCenterById,
  getEducationalCenterStats,
  getEducationalCenters,
  getRegents,
  updateEducationalCenter,
  updateEducationalCenterStatus,
} from "@/lib/api";

type Filters = {
  search: string;
  code: string;
  status: string;
  has_regent: string;
  shift: string;
  regent: string;
};

type FormState = {
  id?: number;
  code: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  shift: string;
  description: string;
  latitude: string;
  longitude: string;
  status: "activo" | "inactivo";
  deactivation_reason: string;
  regent_id: string;
};

type FormErrors = Partial<Record<keyof FormState, string>> & {
  general?: string;
};

const initialFilters: Filters = {
  search: "",
  code: "",
  status: "",
  has_regent: "",
  shift: "",
  regent: "",
};

const initialForm: FormState = {
  code: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  shift: "",
  description: "",
  latitude: "",
  longitude: "",
  status: "activo",
  deactivation_reason: "",
  regent_id: "",
};

function formatDate(value?: string) {
  if (!value) {
    return "Sin registro";
  }
  return new Date(value).toLocaleDateString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error al procesar la solicitud.";
}

function statusTone(status?: string) {
  return status === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700";
}

function regentTone(center: EducationalCenter) {
  return center.regent ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700";
}

export function EducationalCentersShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [centersData, setCentersData] = useState<EducationalCentersResponse | null>(null);
  const [stats, setStats] = useState<EducationalCenterStats | null>(null);
  const [regents, setRegents] = useState<RegentOption[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<EducationalCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [statusTarget, setStatusTarget] = useState<EducationalCenter | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void loadCatalogs();
  }, []);

  useEffect(() => {
    void loadCenters();
  }, [filters, page, pageSize]);

  async function loadCatalogs() {
    try {
      const [statsData, regentsData] = await Promise.all([getEducationalCenterStats(), getRegents()]);
      setStats(statsData);
      setRegents(regentsData);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadCenters() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getEducationalCenters({
        ...filters,
        page,
        page_size: pageSize,
      });
      const parsed = data as EducationalCentersResponse;
      setCentersData(parsed);

      if (parsed.results.length > 0) {
        const nextId =
          selectedCenter && parsed.results.some((center) => center.id === selectedCenter.id)
            ? selectedCenter.id
            : parsed.results[0].id;
        const detail = await getEducationalCenterById(nextId);
        setSelectedCenter(detail);
      } else {
        setSelectedCenter(null);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleApiError(error: unknown) {
    const message = getErrorMessage(error);
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
    if (status === 401 || status === 403) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(message);
  }

  async function openCenterDetail(id: number) {
    try {
      const detail = await getEducationalCenterById(id);
      setSelectedCenter(detail);
      setFormMode(null);
      setErrorMessage("");
      setSuccessMessage("");
    } catch (error) {
      handleApiError(error);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormState(initialForm);
    setFormErrors({});
    setErrorMessage("");
    setSuccessMessage("");
  }

  function openEdit(center: EducationalCenter) {
    setFormMode("edit");
    setFormState({
      id: center.id,
      code: center.code ?? "",
      name: center.name ?? "",
      address: center.address ?? "",
      phone: center.phone ?? "",
      email: center.email ?? "",
      shift: center.shift ?? "",
      description: center.description ?? "",
      latitude: center.latitude ? String(center.latitude) : "",
      longitude: center.longitude ? String(center.longitude) : "",
      status: (center.status ?? (center.is_active ? "activo" : "inactivo")) as "activo" | "inactivo",
      deactivation_reason: center.deactivation_reason ?? "",
      regent_id: center.regent ? String(center.regent.id) : "",
    });
    setFormErrors({});
    setErrorMessage("");
    setSuccessMessage("");
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    if (!formState.name.trim()) {
      nextErrors.name = "El nombre del centro educativo es obligatorio.";
    }
    if (!formState.address.trim()) {
      nextErrors.address = "La dirección es obligatoria.";
    }
    if (!formState.phone.trim()) {
      nextErrors.phone = "El teléfono es obligatorio.";
    } else if (!/^[0-9+\-\s]{7,}$/.test(formState.phone.trim())) {
      nextErrors.phone = "El teléfono debe tener formato válido.";
    }
    if (!formState.email.trim()) {
      nextErrors.email = "El correo electrónico es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim())) {
      nextErrors.email = "Ingrese un correo electrónico válido.";
    }
    if (formState.latitude && Number.isNaN(Number(formState.latitude))) {
      nextErrors.latitude = "La latitud debe ser numérica.";
    }
    if (formState.longitude && Number.isNaN(Number(formState.longitude))) {
      nextErrors.longitude = "La longitud debe ser numérica.";
    }
    if (formState.deactivation_reason.length > 200) {
      nextErrors.deactivation_reason = "El motivo no puede exceder 200 caracteres.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitCenter() {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: EducationalCenterPayload = {
      code: formState.code.trim(),
      name: formState.name.trim(),
      address: formState.address.trim(),
      phone: formState.phone.trim(),
      email: formState.email.trim().toLowerCase(),
      shift: formState.shift.trim(),
      description: formState.description.trim(),
      latitude: formState.latitude.trim(),
      longitude: formState.longitude.trim(),
      status: formState.status,
      deactivation_reason: formState.deactivation_reason.trim(),
      regent_id: formState.regent_id ? Number(formState.regent_id) : null,
    };

    try {
      const saved =
        formMode === "edit" && formState.id
          ? await updateEducationalCenter(formState.id, payload)
          : await createEducationalCenter(payload);
      setSelectedCenter(saved);
      setFormMode(null);
      setSuccessMessage(formMode === "edit" ? "Centro educativo actualizado correctamente." : "Centro educativo registrado correctamente.");
      await Promise.all([loadCenters(), loadCatalogs()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function submitStatusChange() {
    if (!statusTarget) {
      return;
    }

    setSaving(true);
    try {
      const nextStatus = (statusTarget.status ?? (statusTarget.is_active ? "activo" : "inactivo")) === "activo" ? "inactivo" : "activo";
      const updated = await updateEducationalCenterStatus(statusTarget.id, nextStatus, formState.deactivation_reason.trim());
      setSelectedCenter(updated);
      setStatusTarget(null);
      setFormState((current) => ({ ...current, deactivation_reason: "" }));
      setSuccessMessage(nextStatus === "activo" ? "Centro educativo activado correctamente." : "Centro educativo desactivado correctamente.");
      await Promise.all([loadCenters(), loadCatalogs()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteEducationalCenter(id);
      setSuccessMessage("Centro educativo eliminado correctamente.");
      if (selectedCenter?.id === id) {
        setSelectedCenter(null);
      }
      await Promise.all([loadCenters(), loadCatalogs()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  const summaryCards = [
    ["Total de centros educativos", stats?.total_centros ?? 0],
    ["Centros activos", stats?.activos ?? 0],
    ["Centros inactivos", stats?.inactivos ?? 0],
    ["Con regente asignado", stats?.con_regente_asignado ?? 0],
    ["Sin regente asignado", stats?.sin_regente_asignado ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Centros Educativos"
      eyebrow="Administración / Centros Educativos"
      title="Gestión de Centros Educativos"
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky"
        >
          <Plus className="h-4 w-4" />
          Registrar Centro Educativo
        </button>
      }
    >
      <p className="-mt-5 mb-6 text-sm leading-6 text-slate-500">
        Administra los centros educativos monitoreados, su estado operativo y la asignación de regentes dentro del sistema.
      </p>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => (
          <article key={String(label)} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      {(errorMessage || successMessage) && (
        <section className={`mt-6 rounded-[1.5rem] border px-5 py-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {errorMessage || successMessage}
        </section>
      )}

      <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]">
          <input
            value={draftFilters.search}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Buscar por nombre"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          />
          <input
            value={draftFilters.code}
            onChange={(event) => setDraftFilters((current) => ({ ...current, code: event.target.value }))}
            placeholder="Buscar por código"
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
            value={draftFilters.has_regent}
            onChange={(event) => setDraftFilters((current) => ({ ...current, has_regent: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">Regente</option>
            <option value="true">Con regente</option>
            <option value="false">Sin regente</option>
          </select>
          <select
            value={draftFilters.shift}
            onChange={(event) => setDraftFilters((current) => ({ ...current, shift: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">Turno</option>
            <option value="Mañana">Mañana</option>
            <option value="Tarde">Tarde</option>
            <option value="Noche">Noche</option>
          </select>
          <select
            value={draftFilters.regent}
            onChange={(event) => setDraftFilters((current) => ({ ...current, regent: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky"
          >
            <option value="">Regente asignado</option>
            {regents.map((regent) => (
              <option key={regent.id} value={regent.id}>
                {regent.full_name}
              </option>
            ))}
          </select>
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
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Listado de centros educativos</h3>
              <p className="mt-1 text-sm text-slate-500">Consulta, actualiza y gestiona los centros registrados.</p>
            </div>
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none"
            >
              <option value={8}>8 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-4 font-medium">Código</th>
                  <th className="pb-4 font-medium">Centro educativo</th>
                  <th className="pb-4 font-medium">Dirección</th>
                  <th className="pb-4 font-medium">Teléfono</th>
                  <th className="pb-4 font-medium">Regente</th>
                  <th className="pb-4 font-medium">Estado</th>
                  <th className="pb-4 font-medium">Fecha registro</th>
                  <th className="pb-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-500">Cargando centros educativos...</td></tr>
                ) : centersData?.results.length ? (
                  centersData.results.map((center) => (
                    <tr key={center.id} className="text-slate-700">
                      <td className="py-4 font-semibold">{center.code}</td>
                      <td className="py-4">{center.name}</td>
                      <td className="py-4">{center.address}</td>
                      <td className="py-4">{center.phone}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${regentTone(center)}`}>
                          {center.regent?.full_name ?? "Sin regente"}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(center.status)}`}>
                          {center.status}
                        </span>
                      </td>
                      <td className="py-4">{formatDate(center.created_at)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void openCenterDetail(center.id)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={() => void getEducationalCenterById(center.id).then(openEdit).catch(handleApiError)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setStatusTarget(center)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                            <ToggleLeft className="h-4 w-4" />
                          </button>
                          <button onClick={() => void handleDelete(center.id)} className="rounded-xl border border-slate-200 p-2 text-rose-600 hover:bg-rose-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-500">No se encontraron centros educativos.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-100 px-4 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <p>
              Página {centersData?.page ?? 1} de {centersData?.total_pages ?? 1} · {centersData?.count ?? 0} registros
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1}
                className="rounded-2xl border border-slate-200 px-4 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((current) => Math.min(current + 1, centersData?.total_pages ?? current))}
                disabled={!centersData || page >= centersData.total_pages}
                className="rounded-2xl border border-slate-200 px-4 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </article>

        <aside className="space-y-6">
          <section className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">Detalle del Centro</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">Resumen operativo</h3>
              </div>
            </div>

            {selectedCenter ? (
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-lg font-bold text-navy">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">{selectedCenter.name}</h4>
                    <p className="text-sm text-slate-500">{selectedCenter.code}</p>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4" />{selectedCenter.address || "Sin dirección"}</div>
                  <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4" />{selectedCenter.phone || "Sin teléfono"}</div>
                  <p><span className="font-semibold text-slate-800">Correo:</span> {selectedCenter.email || "Sin correo"}</p>
                  <p><span className="font-semibold text-slate-800">Regente:</span> {selectedCenter.regent?.full_name ?? "Sin asignar"}</p>
                  <p><span className="font-semibold text-slate-800">Niños asociados:</span> {selectedCenter.children_count ?? 0}</p>
                  <p><span className="font-semibold text-slate-800">Estado:</span> {selectedCenter.status}</p>
                  <p><span className="font-semibold text-slate-800">Turno:</span> {selectedCenter.shift || "No definido"}</p>
                  <p><span className="font-semibold text-slate-800">Descripción:</span> {selectedCenter.description || "Sin descripción"}</p>
                  <p><span className="font-semibold text-slate-800">Registrado:</span> {formatDate(selectedCenter.created_at)}</p>
                  <p><span className="font-semibold text-slate-800">Actualizado:</span> {formatDate(selectedCenter.updated_at)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Seleccione un centro educativo del listado para ver su detalle.</p>
            )}
          </section>

          <section className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <h3 className="text-lg font-semibold text-slate-900">Validaciones del sistema</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Nombre, dirección, teléfono, correo y estado son obligatorios.</p>
              <p>El regente asignado debe tener rol Regente.</p>
              <p>La latitud y longitud deben ser numéricas si se registran.</p>
              <p>No se puede eliminar un centro con niños asociados.</p>
            </div>
          </section>

          <section className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <h3 className="text-lg font-semibold text-slate-900">Información importante</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Los centros inactivos no deben recibir nuevas asignaciones operativas.</p>
              <p>La desactivación conserva historial y requiere motivo administrativo.</p>
              <p>Puede reactivar centros inactivos cuando recuperen operación.</p>
            </div>
          </section>
        </aside>
      </section>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">Formulario administrativo</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {formMode === "create" ? "Registrar Centro Educativo" : "Editar Centro Educativo"}
                </h3>
              </div>
              <button onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 p-3 text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {[
                ["code", "Código", "Ej. CEN-0006"],
                ["name", "Nombre del centro educativo", "Ingrese el nombre"],
                ["address", "Dirección", "Ingrese la dirección"],
                ["phone", "Teléfono", "Ingrese el teléfono"],
                ["email", "Correo electrónico", "Ingrese el correo"],
                ["shift", "Turno", "Ej. Mañana"],
                ["latitude", "Latitud", "Ej. -17.783327"],
                ["longitude", "Longitud", "Ej. -63.182140"],
              ].map(([key, label, placeholder]) => (
                <label key={key} className={key === "address" ? "md:col-span-2" : ""}>
                  <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
                  <input
                    value={formState[key as keyof FormState] as string}
                    onChange={(event) => setFormState((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  {formErrors[key as keyof FormState] ? <p className="mt-2 text-sm text-rose-600">{formErrors[key as keyof FormState]}</p> : null}
                </label>
              ))}

              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Descripción</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Regente asignado</span>
                <select
                  value={formState.regent_id}
                  onChange={(event) => setFormState((current) => ({ ...current, regent_id: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="">Sin regente</option>
                  {regents.map((regent) => (
                    <option key={regent.id} value={regent.id}>
                      {regent.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Estado</span>
                <select
                  value={formState.status}
                  onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as "activo" | "inactivo" }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </label>

              {formState.status === "inactivo" ? (
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Motivo de desactivación</span>
                  <textarea
                    value={formState.deactivation_reason}
                    onChange={(event) => setFormState((current) => ({ ...current, deactivation_reason: event.target.value }))}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  {formErrors.deactivation_reason ? <p className="mt-2 text-sm text-rose-600">{formErrors.deactivation_reason}</p> : null}
                </label>
              ) : null}
            </div>

            {formErrors.general ? <p className="mt-4 text-sm text-rose-600">{formErrors.general}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
                Cancelar
              </button>
              <button
                onClick={() => void submitCenter()}
                disabled={saving}
                className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
              >
                {saving ? "Guardando..." : formMode === "create" ? "Registrar centro" : "Guardar cambios"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <section className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {(statusTarget.status ?? (statusTarget.is_active ? "activo" : "inactivo")) === "activo"
                    ? "Desactivar centro educativo"
                    : "Activar centro educativo"}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Confirme la acción para <strong>{statusTarget.name}</strong>. Si desactiva el centro, registre un motivo.
                </p>
              </div>
            </div>

            {(statusTarget.status ?? (statusTarget.is_active ? "activo" : "inactivo")) === "activo" ? (
              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Motivo de desactivación</span>
                <textarea
                  value={formState.deactivation_reason}
                  onChange={(event) => setFormState((current) => ({ ...current, deactivation_reason: event.target.value }))}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStatusTarget(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
                Cancelar
              </button>
              <button onClick={() => void submitStatusChange()} className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white">
                Confirmar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}

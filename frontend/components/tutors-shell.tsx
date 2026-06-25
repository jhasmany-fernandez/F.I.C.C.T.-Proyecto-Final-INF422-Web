"use client";

import {
  AlertTriangle,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  Child,
  TutorDetail,
  TutorPayload,
  TutorStats,
  TutorsResponse,
  createTutor,
  deleteTutor,
  getChildren,
  getTutorById,
  getTutorMobileAccount,
  getTutorStats,
  getTutors,
  resetTutorPassword,
  updateTutor,
  updateTutorChildren,
  updateTutorStatus,
} from "@/lib/api";

type Filters = {
  search: string;
  parentesco: string;
  estado: string;
  child_id: string;
  cuenta_movil_estado: string;
  fecha_registro: string;
};

type FormState = {
  id?: number;
  nombres: string;
  apellidos: string;
  correo_electronico: string;
  telefono: string;
  direccion: string;
  parentesco: string;
  estado: "ACTIVO" | "INACTIVO";
  cuenta_movil_estado: "ACTIVA" | "INACTIVA" | "SIN_CUENTA";
  correo_acceso: string;
  motivo_desactivacion: string;
  child_ids: number[];
  childSearch: string;
};

const parentescos = ["Madre", "Padre", "Abuelo", "Abuela", "Tío", "Tía", "Tutor Legal", "Otro"];

const initialFilters: Filters = {
  search: "",
  parentesco: "",
  estado: "",
  child_id: "",
  cuenta_movil_estado: "",
  fecha_registro: "",
};

const initialForm: FormState = {
  nombres: "",
  apellidos: "",
  correo_electronico: "",
  telefono: "",
  direccion: "",
  parentesco: "",
  estado: "ACTIVO",
  cuenta_movil_estado: "ACTIVA",
  correo_acceso: "",
  motivo_desactivacion: "",
  child_ids: [],
  childSearch: "",
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Sin registro";
  }
  return new Date(value).toLocaleDateString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

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

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Error al guardar la información. Intente nuevamente.";
}

function statusTone(estado: string) {
  return estado === "ACTIVO" || estado === "ACTIVA"
    ? "bg-emerald-100 text-emerald-700"
    : estado === "SIN_CUENTA"
      ? "bg-slate-200 text-slate-700"
      : "bg-rose-100 text-rose-700";
}

export function TutorsShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [tutorsData, setTutorsData] = useState<TutorsResponse | null>(null);
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [selectedTutor, setSelectedTutor] = useState<TutorDetail | null>(null);
  const [childrenCatalog, setChildrenCatalog] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailTab, setDetailTab] = useState<"informacion" | "children" | "mobile">("informacion");
  const [formMode, setFormMode] = useState<"create" | "edit" | "children" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [statusTarget, setStatusTarget] = useState<TutorDetail | null>(null);

  const filteredChildren = useMemo(() => {
    const term = formState.childSearch.trim().toLowerCase();
    return childrenCatalog.filter((child) => {
      if (!term) {
        return true;
      }
      return (
        child.nombre_completo.toLowerCase().includes(term) ||
        child.code.toLowerCase().includes(term) ||
        child.curso.toLowerCase().includes(term)
      );
    });
  }, [childrenCatalog, formState.childSearch]);

  const selectedChildren = useMemo(
    () => childrenCatalog.filter((child) => formState.child_ids.includes(child.id)),
    [childrenCatalog, formState.child_ids],
  );

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadTutors();
  }, [filters, page, pageSize]);

  async function loadBaseData() {
    try {
      const [statsData, childrenData] = await Promise.all([
        getTutorStats(),
        getChildren({ page: 1, page_size: 100 }),
      ]);
      setStats(statsData);
      setChildrenCatalog(childrenData.results);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadTutors() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getTutors({ ...filters, page, page_size: pageSize });
      setTutorsData(data);

      if (data.results.length > 0) {
        const tutorId =
          selectedTutor && data.results.some((tutor) => tutor.id === selectedTutor.id) ? selectedTutor.id : data.results[0].id;
        const detail = await getTutorById(tutorId);
        setSelectedTutor(detail);
      } else {
        setSelectedTutor(null);
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
    if (status === 401) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(status === 403 ? "No tiene permisos para realizar esta acción." : message);
  }

  async function openTutorDetail(id: number) {
    try {
      const detail = await getTutorById(id);
      const mobileAccount = await getTutorMobileAccount(id);
      setSelectedTutor({ ...detail, mobile_account: mobileAccount });
      setFormMode(null);
      setDetailTab("informacion");
      setSuccessMessage("");
    } catch (error) {
      handleApiError(error);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormState(initialForm);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function openEdit(tutor: TutorDetail) {
    setFormMode("edit");
    setFormState({
      id: tutor.id,
      nombres: tutor.nombres,
      apellidos: tutor.apellidos,
      correo_electronico: tutor.correo_electronico,
      telefono: tutor.telefono,
      direccion: tutor.direccion,
      parentesco: tutor.parentesco,
      estado: tutor.estado,
      cuenta_movil_estado: tutor.cuenta_movil_estado,
      correo_acceso: tutor.mobile_account.correo_acceso || tutor.correo_electronico,
      motivo_desactivacion: tutor.motivo_desactivacion,
      child_ids: tutor.children.map((child: Child) => child.id),
      childSearch: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function openAssociateChildren(tutor: TutorDetail) {
    openEdit(tutor);
    setFormMode("children");
  }

  function updateDraftFilter(key: keyof Filters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleChild(id: number) {
    setFormState((current) => ({
      ...current,
      child_ids: current.child_ids.includes(id)
        ? current.child_ids.filter((childId) => childId !== id)
        : [...current.child_ids, id],
    }));
  }

  function validateForm() {
    if (
      !formState.nombres.trim() ||
      !formState.apellidos.trim() ||
      !formState.correo_electronico.trim() ||
      !formState.telefono.trim() ||
      !formState.direccion.trim() ||
      !formState.parentesco.trim()
    ) {
      setErrorMessage("Complete todos los campos obligatorios.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.correo_electronico.trim())) {
      setErrorMessage("El formato del correo electrónico es inválido.");
      return false;
    }
    if (!/^[0-9+\-\s]{7,}$/.test(formState.telefono.trim())) {
      setErrorMessage("El teléfono debe tener formato válido.");
      return false;
    }
    if (formState.child_ids.length === 0) {
      setErrorMessage("Debe seleccionar al menos un niño.");
      return false;
    }
    if (formState.motivo_desactivacion.length > 200) {
      setErrorMessage("La descripción no puede exceder 200 caracteres.");
      return false;
    }
    return true;
  }

  async function submitTutor() {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: TutorPayload = {
      nombres: formState.nombres.trim(),
      apellidos: formState.apellidos.trim(),
      correo_electronico: formState.correo_electronico.trim().toLowerCase(),
      telefono: formState.telefono.trim(),
      direccion: formState.direccion.trim(),
      parentesco: formState.parentesco,
      estado: formState.estado,
      cuenta_movil_estado: formState.cuenta_movil_estado,
      correo_acceso: formState.correo_acceso.trim(),
      motivo_desactivacion: formState.motivo_desactivacion.trim(),
      child_ids: formState.child_ids,
    };

    try {
      const saved =
        formMode === "edit" || formMode === "children"
          ? await updateTutor(formState.id!, payload)
          : await createTutor(payload);
      setSelectedTutor(saved);
      setFormMode(null);
      setSuccessMessage(formMode === "create" ? "Tutor registrado correctamente." : "Tutor actualizado correctamente.");
      await Promise.all([loadTutors(), loadBaseData()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function submitChildrenAssociation() {
    if (!formState.id || formState.child_ids.length === 0) {
      setErrorMessage("Debe seleccionar al menos un niño.");
      return;
    }

    setSaving(true);
    try {
      await updateTutorChildren(formState.id, formState.child_ids);
      const detail = await getTutorById(formState.id);
      setSelectedTutor(detail);
      setFormMode(null);
      setSuccessMessage("Niños asociados actualizados correctamente.");
      await loadTutors();
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!statusTarget) {
      return;
    }

    setSaving(true);
    try {
      const nextState = statusTarget.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
      const updated = await updateTutorStatus(statusTarget.id, nextState, formState.motivo_desactivacion.trim());
      setSelectedTutor(updated);
      setStatusTarget(null);
      setFormState((current) => ({ ...current, motivo_desactivacion: "" }));
      setSuccessMessage(nextState === "INACTIVO" ? "Tutor desactivado correctamente." : "Tutor activado correctamente.");
      await Promise.all([loadTutors(), loadBaseData()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const response = await deleteTutor(id);
      setSuccessMessage(response.message);
      await Promise.all([loadTutors(), loadBaseData()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function handleResetPassword() {
    if (!selectedTutor) {
      return;
    }
    try {
      const response = await resetTutorPassword(selectedTutor.id);
      setSuccessMessage(`${response.message} Temporal: ${response.temporary_password}`);
    } catch (error) {
      handleApiError(error);
    }
  }

  const summaryCards = [
    ["Total Tutores", stats?.total_tutores ?? 0],
    ["Activos", stats?.activos ?? 0],
    ["Inactivos", stats?.inactivos ?? 0],
    ["Con Cuenta Móvil", stats?.con_cuenta_movil ?? 0],
    ["Sin Cuenta Móvil", stats?.sin_cuenta_movil ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Tutores Responsables"
      eyebrow="Inicio / Tutores Responsables"
      title="Gestión de Tutores Responsables"
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky"
        >
          <Plus className="h-4 w-4" />
          Nuevo Tutor
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => (
          <article key={String(label)} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      {(errorMessage || successMessage) && (
        <div className={`mt-6 rounded-[1.5rem] border px-5 py-4 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {errorMessage || successMessage}
        </div>
      )}

      <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-700">Buscar tutor</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={draftFilters.search}
                onChange={(event) => updateDraftFilter("search", event.target.value)}
                placeholder="Nombre, correo o teléfono"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">Parentesco</span>
            <select
              value={draftFilters.parentesco}
              onChange={(event) => updateDraftFilter("parentesco", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos</option>
              {parentescos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">Estado</span>
            <select
              value={draftFilters.estado}
              onChange={(event) => updateDraftFilter("estado", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">Niño asociado</span>
            <select
              value={draftFilters.child_id}
              onChange={(event) => updateDraftFilter("child_id", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos</option>
              {childrenCatalog.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.nombre_completo}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-700">Fecha registro</span>
            <input
              type="date"
              value={draftFilters.fecha_registro}
              onChange={(event) => updateDraftFilter("fecha_registro", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => {
              setFilters(draftFilters);
              setPage(1);
            }}
            className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white"
          >
            Buscar
          </button>
          <button
            onClick={() => {
              setDraftFilters(initialFilters);
              setFilters(initialFilters);
              setPage(1);
            }}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.9fr)]">
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Listado de tutores</h3>
              <p className="mt-1 text-sm text-slate-500">Control administrativo de tutores responsables asociados al sistema.</p>
            </div>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
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
                  <th className="pb-3">ID</th>
                  <th className="pb-3">Nombre completo</th>
                  <th className="pb-3">Correo</th>
                  <th className="pb-3">Teléfono</th>
                  <th className="pb-3">Parentesco</th>
                  <th className="pb-3">Niños</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3">Cuenta móvil</th>
                  <th className="pb-3">Fecha registro</th>
                  <th className="pb-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      Cargando tutores responsables...
                    </td>
                  </tr>
                ) : tutorsData?.results.length ? (
                  tutorsData.results.map((tutor) => (
                    <tr key={tutor.id} className="border-t border-slate-100 text-slate-700">
                      <td className="py-4">{tutor.id}</td>
                      <td className="py-4 font-semibold">{tutor.nombre_completo}</td>
                      <td className="py-4">{tutor.correo_electronico}</td>
                      <td className="py-4">{tutor.telefono}</td>
                      <td className="py-4">{tutor.parentesco}</td>
                      <td className="py-4">{tutor.children_count}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(tutor.estado)}`}>{tutor.estado}</span>
                      </td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(tutor.cuenta_movil_estado)}`}>
                          {tutor.cuenta_movil_estado}
                        </span>
                      </td>
                      <td className="py-4">{formatDate(tutor.fecha_registro)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void openTutorDetail(tutor.id)} className="rounded-xl border border-slate-200 p-2 text-slate-600">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (selectedTutor && selectedTutor.id === tutor.id) {
                                openEdit(selectedTutor);
                                return;
                              }
                              void openTutorDetail(tutor.id);
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (selectedTutor && selectedTutor.id === tutor.id) {
                                openAssociateChildren(selectedTutor);
                                return;
                              }
                              void openTutorDetail(tutor.id);
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600"
                          >
                            <Users2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              const detail = selectedTutor?.id === tutor.id ? selectedTutor : await getTutorById(tutor.id);
                              if (!detail) {
                                return;
                              }
                              setStatusTarget(detail);
                              setFormState((current) => ({ ...current, motivo_desactivacion: detail.motivo_desactivacion || "" }));
                            }}
                            className="rounded-xl border border-amber-200 p-2 text-amber-700"
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </button>
                          <button onClick={() => void handleDelete(tutor.id)} className="rounded-xl border border-rose-200 p-2 text-rose-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      No se encontraron tutores con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <p>
              Página {tutorsData?.page ?? 1} de {tutorsData?.total_pages ?? 1}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1}
                className="rounded-2xl border border-slate-200 px-4 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((current) => Math.min(current + 1, tutorsData?.total_pages ?? 1))}
                disabled={page >= (tutorsData?.total_pages ?? 1)}
                className="rounded-2xl border border-slate-200 px-4 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">Detalle del Rol</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">Detalle del Tutor</h3>
              </div>
              {selectedTutor && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedTutor.estado)}`}>{selectedTutor.estado}</span>
              )}
            </div>

            {selectedTutor ? (
              <>
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-lg font-bold text-navy">
                    {selectedTutor.nombres.slice(0, 1)}
                    {selectedTutor.apellidos.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{selectedTutor.nombre_completo}</p>
                    <p className="text-sm text-slate-500">ID #{selectedTutor.id} · {selectedTutor.parentesco}</p>
                  </div>
                </div>

                <div className="mt-6 flex gap-2 rounded-2xl bg-slate-100 p-2 text-sm">
                  <button
                    onClick={() => setDetailTab("informacion")}
                    className={`flex-1 rounded-2xl px-3 py-2 ${detailTab === "informacion" ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-600"}`}
                  >
                    Información
                  </button>
                  <button
                    onClick={() => setDetailTab("children")}
                    className={`flex-1 rounded-2xl px-3 py-2 ${detailTab === "children" ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-600"}`}
                  >
                    Niños Asociados
                  </button>
                  <button
                    onClick={() => setDetailTab("mobile")}
                    className={`flex-1 rounded-2xl px-3 py-2 ${detailTab === "mobile" ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-600"}`}
                  >
                    Cuenta Móvil
                  </button>
                </div>

                {detailTab === "informacion" && (
                  <div className="mt-6 space-y-3 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-900">Nombres:</span> {selectedTutor.nombres}</p>
                    <p><span className="font-semibold text-slate-900">Apellidos:</span> {selectedTutor.apellidos}</p>
                    <p><span className="font-semibold text-slate-900">Teléfono:</span> {selectedTutor.telefono}</p>
                    <p><span className="font-semibold text-slate-900">Correo:</span> {selectedTutor.correo_electronico}</p>
                    <p><span className="font-semibold text-slate-900">Dirección:</span> {selectedTutor.direccion}</p>
                    <p><span className="font-semibold text-slate-900">Estado:</span> {selectedTutor.estado}</p>
                    <p><span className="font-semibold text-slate-900">Fecha de registro:</span> {formatDateTime(selectedTutor.fecha_registro)}</p>
                    <p><span className="font-semibold text-slate-900">Última actualización:</span> {formatDateTime(selectedTutor.fecha_actualizacion)}</p>
                  </div>
                )}

                {detailTab === "children" && (
                  <div className="mt-6 space-y-3">
                    {selectedTutor.children.map((child: Child) => (
                      <article key={child.id} className="rounded-2xl border border-slate-100 p-4 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">{child.nombre_completo}</p>
                        <p>{child.curso}</p>
                        <p>{child.centro_educativo.name}</p>
                      </article>
                    ))}
                  </div>
                )}

                {detailTab === "mobile" && (
                  <div className="mt-6 space-y-4 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-900">Estado de cuenta:</span> {selectedTutor.mobile_account.estado}</p>
                    <p><span className="font-semibold text-slate-900">Correo de acceso:</span> {selectedTutor.mobile_account.correo_acceso || "Sin cuenta"}</p>
                    <p><span className="font-semibold text-slate-900">Último acceso:</span> {formatDateTime(selectedTutor.mobile_account.ultimo_acceso)}</p>
                    <p><span className="font-semibold text-slate-900">Rol en la app:</span> {selectedTutor.mobile_account.rol_app}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => void handleResetPassword()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-slate-700"
                      >
                        <KeyRound className="h-4 w-4" />
                        Restablecer contraseña
                      </button>
                      <button
                        onClick={() => setStatusTarget(selectedTutor)}
                        className="rounded-2xl border border-rose-200 px-4 py-3 font-semibold text-rose-700"
                      >
                        Desactivar cuenta
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Seleccione un tutor del listado para ver su información detallada.</p>
            )}
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-panel">
            <h3 className="text-lg font-semibold text-slate-900">Validaciones del Sistema</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Los campos marcados con (*) son obligatorios.</p>
              <p>El correo electrónico debe tener formato válido.</p>
              <p>El teléfono debe tener formato válido.</p>
              <p>El correo no debe estar registrado previamente.</p>
              <p>El teléfono no debe estar registrado previamente.</p>
              <p>Debe asociar al menos un niño.</p>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-panel">
            <h3 className="text-lg font-semibold text-slate-900">Información Importante</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Un tutor puede estar asociado a uno o varios niños.</p>
              <p>Un niño puede tener uno o varios tutores asociados.</p>
              <p>Los tutores inactivos no pueden iniciar sesión ni reciben notificaciones.</p>
              <p>El historial de alertas y ubicaciones se conserva aunque el tutor esté inactivo.</p>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-panel">
            <h3 className="text-lg font-semibold text-slate-900">Acciones Rápidas</h3>
            <div className="mt-4 grid gap-3 text-sm">
              <button className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-slate-700">Exportar lista de tutores</button>
              <button className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-slate-700">Importar tutores desde Excel</button>
              <button className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-slate-700">Ver tutores inactivos</button>
              <button className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-slate-700">Historial de cambios</button>
            </div>
          </section>
        </aside>
      </section>

      {formMode && (
        <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-sky">{formMode === "create" ? "Registro" : formMode === "edit" ? "Edición" : "Asociación"}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                {formMode === "create" ? "Crear Nuevo Tutor" : formMode === "edit" ? "Editar Tutor" : "Asociar Niños al Tutor"}
              </h3>
            </div>
            <button onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 p-3 text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          {formMode !== "children" && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Nombres *</span>
                <input value={formState.nombres} onChange={(e) => setFormState((c) => ({ ...c, nombres: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Apellidos *</span>
                <input value={formState.apellidos} onChange={(e) => setFormState((c) => ({ ...c, apellidos: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Teléfono *</span>
                <input value={formState.telefono} onChange={(e) => setFormState((c) => ({ ...c, telefono: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Correo electrónico *</span>
                <input value={formState.correo_electronico} onChange={(e) => setFormState((c) => ({ ...c, correo_electronico: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" />
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Dirección *</span>
                <input value={formState.direccion} onChange={(e) => setFormState((c) => ({ ...c, direccion: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Parentesco *</span>
                <select value={formState.parentesco} onChange={(e) => setFormState((c) => ({ ...c, parentesco: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none">
                  <option value="">Seleccione una opción</option>
                  {parentescos.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Estado *</span>
                <select value={formState.estado} onChange={(e) => setFormState((c) => ({ ...c, estado: e.target.value as FormState["estado"] }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none">
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Estado cuenta móvil</span>
                <select
                  value={formState.cuenta_movil_estado}
                  onChange={(e) => setFormState((c) => ({ ...c, cuenta_movil_estado: e.target.value as FormState["cuenta_movil_estado"] }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="ACTIVA">Activa</option>
                  <option value="INACTIVA">Inactiva</option>
                  <option value="SIN_CUENTA">Sin cuenta</option>
                </select>
              </label>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <label>
                <span className="mb-2 block text-sm font-medium text-slate-700">Buscar niños asociados</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={formState.childSearch}
                    onChange={(event) => setFormState((current) => ({ ...current, childSearch: event.target.value }))}
                    placeholder="Nombre, código o curso"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </label>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredChildren.map((child) => {
                  const checked = formState.child_ids.includes(child.id);
                  return (
                    <label key={child.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${checked ? "border-sky bg-sky-50" : "border-slate-200"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleChild(child.id)} className="mt-1 h-4 w-4 rounded border-slate-300" />
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">{child.nombre_completo}</p>
                        <p className="text-slate-500">{child.curso}</p>
                        <p className="text-slate-500">{child.centro_educativo.name}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-sky" />
                <h4 className="font-semibold text-slate-900">Niños seleccionados</h4>
              </div>
              <div className="mt-4 space-y-3">
                {selectedChildren.length ? (
                  selectedChildren.map((child) => (
                    <div key={child.id} className="rounded-2xl bg-white p-3 text-sm shadow-sm">
                      <p className="font-semibold text-slate-900">{child.nombre_completo}</p>
                      <p className="text-slate-500">{child.curso}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Debe asociar al menos un niño.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
              Cancelar
            </button>
            <button
              onClick={() => void (formMode === "children" ? submitChildrenAssociation() : submitTutor())}
              disabled={saving}
              className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Guardando..." : formMode === "create" ? "Guardar Tutor" : formMode === "children" ? "Actualizar Asociación" : "Actualizar Tutor"}
            </button>
          </div>
        </section>
      )}

      {statusTarget && (
        <section className="mt-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 text-amber-700" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">Desactivar Tutor</h3>
              <p className="mt-2 text-sm text-slate-600">
                El tutor quedará inactivo y no podrá iniciar sesión en la app móvil ni recibirá notificaciones.
              </p>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Motivo opcional</span>
                <textarea
                  value={formState.motivo_desactivacion}
                  onChange={(event) => setFormState((current) => ({ ...current, motivo_desactivacion: event.target.value.slice(0, 200) }))}
                  rows={4}
                  className="w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm outline-none"
                />
              </label>
              <div className="mt-4 flex gap-3">
                <button onClick={() => setStatusTarget(null)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700">
                  Cancelar
                </button>
                <button onClick={() => void handleStatusChange()} className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white">
                  {statusTarget.estado === "ACTIVO" ? "Desactivar Tutor" : "Activar Tutor"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </AdminShell>
  );
}

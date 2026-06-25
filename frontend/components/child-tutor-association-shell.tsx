"use client";

import {
  CalendarClock,
  CheckSquare,
  CircleAlert,
  Link2,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  ApiError,
  Child,
  ChildTutorAssociation,
  ChildTutorAssociationHistory,
  ChildTutorAssociationStats,
  TutorListItem,
  createChildTutorAssociation,
  deleteChildTutorAssociation,
  getChildTutorAssociationHistory,
  getChildTutorAssociationStats,
  getChildTutorAssociationsByChild,
  getChildren,
  getTutors,
} from "@/lib/api";

type ChildFilters = {
  search: string;
  center: string;
  course: string;
  status: string;
};

type TutorFilters = {
  search: string;
  parentesco: string;
  estado: string;
};

const initialChildFilters: ChildFilters = {
  search: "",
  center: "",
  course: "",
  status: "activo",
};

const initialTutorFilters: TutorFilters = {
  search: "",
  parentesco: "",
  estado: "ACTIVO",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function formatDate(value?: string | null) {
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

function statusTone(status?: string) {
  return status === "activo" || status === "ACTIVO"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-slate-200 text-slate-700";
}

function actionLabel(action: string) {
  if (action === "CREACION") return "Creación";
  if (action === "ELIMINACION") return "Eliminación";
  if (action === "REACTIVACION") return "Reactivación";
  return action;
}

export function ChildTutorAssociationShell() {
  const router = useRouter();
  const [stats, setStats] = useState<ChildTutorAssociationStats | null>(null);
  const [childrenCatalog, setChildrenCatalog] = useState<Child[]>([]);
  const [tutorsCatalog, setTutorsCatalog] = useState<TutorListItem[]>([]);
  const [childFilters, setChildFilters] = useState(initialChildFilters);
  const [tutorFilters, setTutorFilters] = useState(initialTutorFilters);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedTutorIds, setSelectedTutorIds] = useState<number[]>([]);
  const [existingAssociations, setExistingAssociations] = useState<ChildTutorAssociation[]>([]);
  const [associationHistory, setAssociationHistory] = useState<ChildTutorAssociationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedChild = useMemo(
    () => childrenCatalog.find((child) => child.id === selectedChildId) ?? null,
    [childrenCatalog, selectedChildId],
  );

  const selectedTutors = useMemo(
    () => tutorsCatalog.filter((tutor) => selectedTutorIds.includes(tutor.id)),
    [selectedTutorIds, tutorsCatalog],
  );

  const childCourses = useMemo(
    () => Array.from(new Set(childrenCatalog.map((child) => child.curso))).sort((left, right) => left.localeCompare(right)),
    [childrenCatalog],
  );

  const childCenters = useMemo(
    () =>
      Array.from(new Map(childrenCatalog.map((child) => [child.centro_educativo.id, child.centro_educativo])).values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [childrenCatalog],
  );

  const tutorParentescos = useMemo(
    () => Array.from(new Set(tutorsCatalog.map((tutor) => tutor.parentesco))).sort((left, right) => left.localeCompare(right)),
    [tutorsCatalog],
  );

  const filteredChildren = useMemo(() => {
    const search = childFilters.search.trim().toLowerCase();
    return childrenCatalog.filter((child) => {
      const matchesSearch =
        !search ||
        child.nombre_completo.toLowerCase().includes(search) ||
        child.curso.toLowerCase().includes(search) ||
        child.centro_educativo.name.toLowerCase().includes(search) ||
        child.dispositivo_gps?.code.toLowerCase().includes(search);
      const matchesCenter = !childFilters.center || String(child.centro_educativo.id) === childFilters.center;
      const matchesCourse = !childFilters.course || child.curso === childFilters.course;
      const matchesStatus = !childFilters.status || child.status === childFilters.status;
      return matchesSearch && matchesCenter && matchesCourse && matchesStatus;
    });
  }, [childFilters, childrenCatalog]);

  const filteredTutors = useMemo(() => {
    const search = tutorFilters.search.trim().toLowerCase();
    return tutorsCatalog.filter((tutor) => {
      const matchesSearch =
        !search ||
        tutor.nombre_completo.toLowerCase().includes(search) ||
        tutor.correo_electronico.toLowerCase().includes(search) ||
        tutor.telefono.toLowerCase().includes(search) ||
        tutor.parentesco.toLowerCase().includes(search);
      const matchesParentesco = !tutorFilters.parentesco || tutor.parentesco === tutorFilters.parentesco;
      const matchesEstado = !tutorFilters.estado || tutor.estado === tutorFilters.estado;
      return matchesSearch && matchesParentesco && matchesEstado;
    });
  }, [tutorFilters, tutorsCatalog]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedChildId) {
      setExistingAssociations([]);
      setAssociationHistory([]);
      return;
    }
    void loadAssociations(selectedChildId);
  }, [selectedChildId]);

  async function bootstrap() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [statsData, childrenData, tutorsData] = await Promise.all([
        getChildTutorAssociationStats(),
        getChildren({ page: 1, page_size: 100 }),
        getTutors({ page: 1, page_size: 100, estado: "ACTIVO" }),
      ]);
      setStats(statsData);
      setChildrenCatalog(childrenData.results);
      setTutorsCatalog(tutorsData.results);

      if (childrenData.results.length > 0) {
        setSelectedChildId((current) => current ?? childrenData.results[0].id);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAssociations(childId: number) {
    setLoading(true);
    setErrorMessage("");

    try {
      const associations = await getChildTutorAssociationsByChild(childId);
      setExistingAssociations(associations);

      const historyChunks = await Promise.all(associations.map((association) => getChildTutorAssociationHistory(association.id)));
      const mergedHistory = historyChunks
        .flat()
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
      setAssociationHistory(mergedHistory);
      setSelectedTutorIds([]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleApiError(error: unknown) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 401 || status === 403) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(getErrorMessage(error));
  }

  function toggleTutor(tutorId: number) {
    setSuccessMessage("");
    setErrorMessage("");
    setSelectedTutorIds((current) =>
      current.includes(tutorId) ? current.filter((id) => id !== tutorId) : [...current, tutorId],
    );
  }

  async function handleSave() {
    if (!selectedChildId) {
      setErrorMessage("Debe seleccionar un niño.");
      return;
    }
    if (selectedTutorIds.length === 0) {
      setErrorMessage("Debe seleccionar al menos un tutor.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await createChildTutorAssociation({
        child_id: selectedChildId,
        tutor_ids: selectedTutorIds,
      });
      setSuccessMessage(response.message);
      await bootstrap();
      await loadAssociations(selectedChildId);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAssociation(associationId: number) {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await deleteChildTutorAssociation(associationId);
      setSuccessMessage(response.message);
      if (selectedChildId) {
        await bootstrap();
        await loadAssociations(selectedChildId);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setSelectedTutorIds([]);
    setErrorMessage("");
    setSuccessMessage("");
  }

  return (
    <AdminShell
      activeItem="Asociación Tutor-Niño"
      eyebrow="CU8 Web"
      title="Asociar Niño a Tutor Responsable"
      actions={
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Recargar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Guardar Asociación
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["Niños activos", stats?.ninos_activos ?? 0],
            ["Tutores activos", stats?.tutores_activos ?? 0],
            ["Asociaciones activas", stats?.asociaciones_activas ?? 0],
            ["Niños sin tutor", stats?.ninos_sin_tutor_asignado ?? 0],
            ["Última actualización", stats?.ultima_actualizacion ? formatDate(stats.ultima_actualizacion) : "Sin cambios"],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
            </article>
          ))}
        </section>

        {(errorMessage || successMessage) && (
          <section className="space-y-3">
            {errorMessage ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
            {successMessage ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p> : null}
          </section>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <article className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center gap-3">
              <UserRoundCheck className="h-5 w-5 text-sky" />
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Seleccionar Niño</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Niños monitoreados</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Search className="h-4 w-4" />
                  Buscar
                </div>
                <input
                  value={childFilters.search}
                  onChange={(event) => setChildFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Nombre, curso, centro o GPS"
                  className="mt-2 w-full bg-transparent text-sm outline-none"
                />
              </label>
              <select
                value={childFilters.center}
                onChange={(event) => setChildFilters((current) => ({ ...current, center: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <option value="">Todos los centros</option>
                {childCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
              <select
                value={childFilters.course}
                onChange={(event) => setChildFilters((current) => ({ ...current, course: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <option value="">Todos los cursos</option>
                {childCourses.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              <select
                value={childFilters.status}
                onChange={(event) => setChildFilters((current) => ({ ...current, status: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 pr-4">Sel.</th>
                    <th className="pb-3 pr-4">ID</th>
                    <th className="pb-3 pr-4">Nombre</th>
                    <th className="pb-3 pr-4">Curso</th>
                    <th className="pb-3 pr-4">Centro</th>
                    <th className="pb-3 pr-4">GPS</th>
                    <th className="pb-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChildren.map((child) => (
                    <tr key={child.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4">
                        <input
                          type="radio"
                          name="selected-child"
                          checked={selectedChildId === child.id}
                          onChange={() => setSelectedChildId(child.id)}
                        />
                      </td>
                      <td className="py-3 pr-4 text-slate-600">#{child.id}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{child.nombre_completo}</td>
                      <td className="py-3 pr-4 text-slate-600">{child.curso}</td>
                      <td className="py-3 pr-4 text-slate-600">{child.centro_educativo.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{child.dispositivo_gps?.code ?? "Sin GPS"}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(child.status)}`}>{child.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-sky" />
                <h3 className="text-xl font-bold text-slate-900">Niño seleccionado</h3>
              </div>
              {selectedChild ? (
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-900">Nombre:</span> {selectedChild.nombre_completo}</p>
                  <p><span className="font-semibold text-slate-900">ID:</span> #{selectedChild.id}</p>
                  <p><span className="font-semibold text-slate-900">Nacimiento:</span> {formatDate(selectedChild.fecha_nacimiento)}</p>
                  <p><span className="font-semibold text-slate-900">Edad:</span> {selectedChild.edad}</p>
                  <p><span className="font-semibold text-slate-900">Curso:</span> {selectedChild.curso}</p>
                  <p><span className="font-semibold text-slate-900">Centro:</span> {selectedChild.centro_educativo.name}</p>
                  <p><span className="font-semibold text-slate-900">GPS:</span> {selectedChild.dispositivo_gps?.code ?? "Sin dispositivo"}</p>
                  <p><span className="font-semibold text-slate-900">Estado:</span> {selectedChild.status}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Seleccione un niño para revisar su detalle y sus tutores asociados.</p>
              )}
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <CircleAlert className="h-5 w-5 text-amber-500" />
                <h3 className="text-xl font-bold text-slate-900">Reglas de asociación</h3>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>El niño debe estar activo.</li>
                <li>El tutor debe estar activo.</li>
                <li>No se duplica una asociación activa entre el mismo niño y tutor.</li>
                <li>Un niño puede tener uno o varios tutores asociados.</li>
                <li>Un tutor puede estar asociado a uno o varios niños.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <article className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center gap-3">
              <UsersRound className="h-5 w-5 text-sky" />
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Seleccionar Tutores</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Tutores responsables activos</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Search className="h-4 w-4" />
                  Buscar
                </div>
                <input
                  value={tutorFilters.search}
                  onChange={(event) => setTutorFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Nombre, correo, teléfono o parentesco"
                  className="mt-2 w-full bg-transparent text-sm outline-none"
                />
              </label>
              <select
                value={tutorFilters.parentesco}
                onChange={(event) => setTutorFilters((current) => ({ ...current, parentesco: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <option value="">Todos los parentescos</option>
                {tutorParentescos.map((parentesco) => (
                  <option key={parentesco} value={parentesco}>
                    {parentesco}
                  </option>
                ))}
              </select>
              <select
                value={tutorFilters.estado}
                onChange={(event) => setTutorFilters((current) => ({ ...current, estado: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <option value="">Todos los estados</option>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 pr-4">Sel.</th>
                    <th className="pb-3 pr-4">ID</th>
                    <th className="pb-3 pr-4">Nombre</th>
                    <th className="pb-3 pr-4">Parentesco</th>
                    <th className="pb-3 pr-4">Teléfono</th>
                    <th className="pb-3 pr-4">Correo</th>
                    <th className="pb-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTutors.map((tutor) => {
                    const alreadyAssociated = existingAssociations.some((association) => association.tutor.id === tutor.id && association.is_active);
                    return (
                      <tr key={tutor.id} className="border-b border-slate-100">
                        <td className="py-3 pr-4">
                          <input
                            type="checkbox"
                            checked={selectedTutorIds.includes(tutor.id)}
                            disabled={alreadyAssociated}
                            onChange={() => toggleTutor(tutor.id)}
                          />
                        </td>
                        <td className="py-3 pr-4 text-slate-600">#{tutor.id}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-900">{tutor.nombre_completo}</td>
                        <td className="py-3 pr-4 text-slate-600">{tutor.parentesco}</td>
                        <td className="py-3 pr-4 text-slate-600">{tutor.telefono}</td>
                        <td className="py-3 pr-4 text-slate-600">{tutor.correo_electronico}</td>
                        <td className="py-3">
                          {alreadyAssociated ? (
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">Ya asociado</span>
                          ) : (
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(tutor.estado)}`}>{tutor.estado}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-emerald-500" />
                <h3 className="text-xl font-bold text-slate-900">Resumen de la asociación</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Niño:</span> {selectedChild?.nombre_completo ?? "Sin selección"}</p>
                <p><span className="font-semibold text-slate-900">Tutores seleccionados:</span> {selectedTutors.length}</p>
                {selectedTutors.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTutors.map((tutor) => (
                      <div key={tutor.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="font-semibold text-slate-900">{tutor.nombre_completo}</p>
                        <p>{tutor.parentesco} · {tutor.correo_electronico}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No hay tutores listos para asociar.</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-sky" />
                <h3 className="text-xl font-bold text-slate-900">Tutores asociados al niño</h3>
              </div>
              <div className="mt-4 space-y-3">
                {existingAssociations.length > 0 ? (
                  existingAssociations.map((association) => (
                    <div key={association.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm text-slate-600">
                          <p className="font-semibold text-slate-900">{association.tutor.nombre_completo}</p>
                          <p>{association.tutor.correo_electronico}</p>
                          <p>{association.tutor.parentesco} · {association.tutor.estado}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAssociation(association.id)}
                          disabled={saving}
                          className="rounded-2xl border border-rose-200 p-2 text-rose-700 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">El niño seleccionado no tiene asociaciones activas.</p>
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-sky" />
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky">Historial</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Historial de asociaciones</h3>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 pr-4">Fecha</th>
                  <th className="pb-3 pr-4">Acción</th>
                  <th className="pb-3 pr-4">Usuario</th>
                  <th className="pb-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {associationHistory.length > 0 ? (
                  associationHistory.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 text-slate-600">{formatDate(entry.created_at)}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{actionLabel(entry.action)}</td>
                      <td className="py-3 pr-4 text-slate-600">{entry.user ?? "Sistema"}</td>
                      <td className="py-3 text-slate-600">{entry.detail}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                      No hay historial disponible para el niño seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

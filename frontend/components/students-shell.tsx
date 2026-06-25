"use client";

import { Eye, History, Pencil, Plus, Search, ShieldAlert, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession, getStoredUser, type StoredUser } from "@/lib/auth";
import {
  createStudent,
  deleteStudent,
  EducationalCenter,
  getEducationalCenters,
  getGpsDevices,
  getStudentById,
  getStudentHistory,
  getStudents,
  getStudentStats,
  GpsDevice,
  Student,
  StudentHistoryEntry,
  StudentStats,
  StudentsResponse,
  updateStudent,
  updateStudentStatus,
} from "@/lib/api";

type Filters = {
  search: string;
  status: string;
  educational_center: string;
  nivel: string;
  curso: string;
  paralelo: string;
  turno: string;
  genero: string;
  has_gps: string;
};

type FormState = {
  id?: number;
  code: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  genero: string;
  ci: string;
  rude: string;
  curso: string;
  paralelo: string;
  nivel: string;
  turno: string;
  direccion: string;
  telefono_contacto: string;
  nombre_contacto_emergencia: string;
  telefono_contacto_emergencia: string;
  educational_center_id: string;
  gps_device_id: string;
  status: string;
  motivo_desactivacion: string;
};

const initialFilters: Filters = {
  search: "",
  status: "",
  educational_center: "",
  nivel: "",
  curso: "",
  paralelo: "",
  turno: "",
  genero: "",
  has_gps: "",
};

const initialForm: FormState = {
  code: "",
  nombres: "",
  apellidos: "",
  fecha_nacimiento: "",
  genero: "OTRO",
  ci: "",
  rude: "",
  curso: "",
  paralelo: "",
  nivel: "PRIMARIA",
  turno: "MANANA",
  direccion: "",
  telefono_contacto: "",
  nombre_contacto_emergencia: "",
  telefono_contacto_emergencia: "",
  educational_center_id: "",
  gps_device_id: "",
  status: "ACTIVO",
  motivo_desactivacion: "",
};

function formatDate(value?: string | null) {
  if (!value) return "Sin dato";
  return new Date(value).toLocaleDateString("es-BO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la solicitud.";
}

function statusTone(status?: string) {
  return status === "ACTIVO" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700";
}

export function StudentsShell() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [studentsData, setStudentsData] = useState<StudentsResponse | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [gpsDevices, setGpsDevices] = useState<GpsDevice[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [historyEntries, setHistoryEntries] = useState<StudentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [statusTarget, setStatusTarget] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Student | null>(null);

  const canManage = user?.rol === "ADMIN";
  const gpsOptions = useMemo(() => {
    const options = [...gpsDevices];
    const current = selectedStudent?.gps_device;
    if (current && !options.some((item) => item.id === current.id)) {
      options.unshift(current);
    }
    return options;
  }, [gpsDevices, selectedStudent]);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [filters, page, pageSize]);

  async function loadBaseData() {
    try {
      const [statsData, centersData, gpsData] = await Promise.all([
        getStudentStats(),
        getEducationalCenters({ page: 1, page_size: 100 }),
        getGpsDevices(),
      ]);
      setStats(statsData);
      setCenters(centersData.results ?? []);
      setGpsDevices(gpsData);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function loadStudents() {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await getStudents({ ...filters, page, page_size: pageSize });
      setStudentsData(data);

      if (data.results.length > 0) {
        const studentId =
          selectedStudent && data.results.some((student) => student.id === selectedStudent.id)
            ? selectedStudent.id
            : data.results[0].id;
        const detail = await getStudentById(studentId);
        setSelectedStudent(detail);
      } else {
        setSelectedStudent(null);
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
    if (status === 401) {
      clearSession();
      router.replace("/");
      return;
    }
    if (status === 403) {
      setErrorMessage("No tiene permisos para acceder a este módulo.");
      return;
    }
    setErrorMessage(message);
  }

  async function openDetail(id: number) {
    try {
      const detail = await getStudentById(id);
      setSelectedStudent(detail);
      setErrorMessage("");
    } catch (error) {
      handleApiError(error);
    }
  }

  async function openEdit(id: number) {
    try {
      const detail = await getStudentById(id);
      setSelectedStudent(detail);
      setFormMode("edit");
      setFormState({
        id: detail.id,
        code: detail.code ?? "",
        nombres: detail.nombres ?? "",
        apellidos: detail.apellidos ?? "",
        fecha_nacimiento: detail.fecha_nacimiento ?? "",
        genero: detail.genero ?? "OTRO",
        ci: detail.ci ?? "",
        rude: detail.rude ?? "",
        curso: detail.curso ?? "",
        paralelo: detail.paralelo ?? "",
        nivel: detail.nivel ?? "PRIMARIA",
        turno: detail.turno ?? "MANANA",
        direccion: detail.direccion ?? "",
        telefono_contacto: detail.telefono_contacto ?? "",
        nombre_contacto_emergencia: detail.nombre_contacto_emergencia ?? "",
        telefono_contacto_emergencia: detail.telefono_contacto_emergencia ?? "",
        educational_center_id: String(detail.educational_center?.id ?? ""),
        gps_device_id: detail.gps_device?.id ? String(detail.gps_device.id) : "",
        status: detail.status ?? "ACTIVO",
        motivo_desactivacion: detail.motivo_desactivacion ?? "",
      });
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

  async function openHistory(student: Student) {
    try {
      const history = await getStudentHistory(student.id);
      setHistoryEntries(history);
      setHistoryTarget(student);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function submitStudent() {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!formState.code.trim()) {
      setSaving(false);
      setErrorMessage("El código es obligatorio.");
      return;
    }
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
    if (!formState.educational_center_id) {
      setSaving(false);
      setErrorMessage("El centro educativo es obligatorio.");
      return;
    }

    try {
      const payload = {
        code: formState.code.trim(),
        nombres: formState.nombres.trim(),
        apellidos: formState.apellidos.trim(),
        fecha_nacimiento: formState.fecha_nacimiento,
        genero: formState.genero,
        ci: formState.ci.trim(),
        rude: formState.rude.trim(),
        curso: formState.curso.trim(),
        paralelo: formState.paralelo.trim(),
        nivel: formState.nivel,
        turno: formState.turno,
        direccion: formState.direccion.trim(),
        telefono_contacto: formState.telefono_contacto.trim(),
        nombre_contacto_emergencia: formState.nombre_contacto_emergencia.trim(),
        telefono_contacto_emergencia: formState.telefono_contacto_emergencia.trim(),
        educational_center_id: Number(formState.educational_center_id),
        gps_device_id: formState.gps_device_id ? Number(formState.gps_device_id) : null,
        status: formState.status,
        motivo_desactivacion: formState.motivo_desactivacion.trim(),
      };

      const detail =
        formMode === "edit" && formState.id ? await updateStudent(formState.id, payload) : await createStudent(payload);
      setSelectedStudent(detail);
      setFormMode(null);
      setSuccessMessage(formMode === "edit" ? "Estudiante actualizado correctamente." : "Estudiante creado correctamente.");
      await Promise.all([loadBaseData(), loadStudents()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function submitStatusChange() {
    if (!statusTarget) return;
    try {
      const nextStatus = statusTarget.status === "ACTIVO" ? "INACTIVO" : "ACTIVO";
      const detail = await updateStudentStatus(statusTarget.id, nextStatus, formState.motivo_desactivacion.trim());
      setSelectedStudent(detail);
      setStatusTarget(null);
      setFormState((current) => ({ ...current, motivo_desactivacion: "" }));
      setSuccessMessage("Estado actualizado correctamente.");
      await Promise.all([loadBaseData(), loadStudents()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    try {
      await deleteStudent(deleteTarget.id);
      if (selectedStudent?.id === deleteTarget.id) {
        setSelectedStudent(null);
      }
      setDeleteTarget(null);
      setSuccessMessage("Estudiante eliminado correctamente.");
      await Promise.all([loadBaseData(), loadStudents()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  const summaryCards = [
    ["Total estudiantes", stats?.total_estudiantes ?? 0],
    ["Activos", stats?.activos ?? 0],
    ["Inactivos", stats?.inactivos ?? 0],
    ["Con GPS", stats?.con_gps ?? 0],
    ["Sin GPS", stats?.sin_gps ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Estudiantes"
      eyebrow="Administración / Estudiantes"
      title="Gestión de Estudiantes"
      actions={
        canManage ? (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Nuevo Estudiante
          </button>
        ) : null
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => (
          <article key={label} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      {errorMessage ? <section className="mt-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</section> : null}
      {successMessage ? <section className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{successMessage}</section> : null}

      <section className="mt-6 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="grid gap-4 xl:grid-cols-3">
          <input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar por nombre, apellido, código, CI o RUDE" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
          <select value={draftFilters.educational_center} onChange={(event) => setDraftFilters((current) => ({ ...current, educational_center: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">Centro educativo</option>
            {centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
          </select>
          <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">Estado</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
          <select value={draftFilters.nivel} onChange={(event) => setDraftFilters((current) => ({ ...current, nivel: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">Nivel</option>
            <option value="INICIAL">Inicial</option>
            <option value="PRIMARIA">Primaria</option>
            <option value="SECUNDARIA">Secundaria</option>
          </select>
          <input value={draftFilters.curso} onChange={(event) => setDraftFilters((current) => ({ ...current, curso: event.target.value }))} placeholder="Curso" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
          <input value={draftFilters.paralelo} onChange={(event) => setDraftFilters((current) => ({ ...current, paralelo: event.target.value }))} placeholder="Paralelo" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky" />
          <select value={draftFilters.turno} onChange={(event) => setDraftFilters((current) => ({ ...current, turno: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">Turno</option>
            <option value="MANANA">Mañana</option>
            <option value="TARDE">Tarde</option>
            <option value="NOCHE">Noche</option>
          </select>
          <select value={draftFilters.genero} onChange={(event) => setDraftFilters((current) => ({ ...current, genero: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">Género</option>
            <option value="MASCULINO">Masculino</option>
            <option value="FEMENINO">Femenino</option>
            <option value="OTRO">Otro</option>
          </select>
          <select value={draftFilters.has_gps} onChange={(event) => setDraftFilters((current) => ({ ...current, has_gps: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky">
            <option value="">GPS</option>
            <option value="true">Con GPS</option>
            <option value="false">Sin GPS</option>
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => { setPage(1); setFilters(draftFilters); }} className="inline-flex items-center gap-2 rounded-2xl bg-sky px-5 py-3 text-sm font-semibold text-white">
            <Search className="h-4 w-4" />
            Buscar
          </button>
          <button onClick={() => { setDraftFilters(initialFilters); setFilters(initialFilters); setPage(1); }} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
            Limpiar
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">Listado de estudiantes</h3>
            <select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-4 font-medium">Código</th>
                  <th className="pb-4 font-medium">Nombre</th>
                  <th className="pb-4 font-medium">Centro</th>
                  <th className="pb-4 font-medium">Curso</th>
                  <th className="pb-4 font-medium">Nivel</th>
                  <th className="pb-4 font-medium">GPS</th>
                  <th className="pb-4 font-medium">Estado</th>
                  <th className="pb-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-500">Cargando estudiantes...</td></tr>
                ) : studentsData?.results.length ? (
                  studentsData.results.map((student) => (
                    <tr key={student.id}>
                      <td className="py-4 font-semibold text-slate-800">{student.code}</td>
                      <td className="py-4 text-slate-700">{student.nombre_completo}</td>
                      <td className="py-4 text-slate-700">{student.educational_center?.name}</td>
                      <td className="py-4 text-slate-700">{student.curso} {student.paralelo}</td>
                      <td className="py-4 text-slate-700">{student.nivel}</td>
                      <td className="py-4 text-slate-700">{student.gps_device?.code ?? "Sin GPS"}</td>
                      <td className="py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(student.status)}`}>{student.status}</span></td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void openDetail(student.id)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Eye className="h-4 w-4" /></button>
                          {canManage ? <button onClick={() => void openEdit(student.id)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Pencil className="h-4 w-4" /></button> : null}
                          {canManage ? <button onClick={() => setStatusTarget(student)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><ShieldAlert className="h-4 w-4" /></button> : null}
                          {canManage ? <button onClick={() => void openHistory(student)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><History className="h-4 w-4" /></button> : null}
                          {canManage ? <button onClick={() => setDeleteTarget(student)} className="rounded-xl border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-500">No existen estudiantes registrados con los filtros aplicados.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <span>Mostrando {studentsData?.results.length ?? 0} de {studentsData?.count ?? 0}</span>
            <div className="flex items-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40">Anterior</button>
              <span>Página {studentsData?.page ?? 1} de {studentsData?.total_pages ?? 1}</span>
              <button disabled={page >= (studentsData?.total_pages ?? 1)} onClick={() => setPage((current) => Math.min(current + 1, studentsData?.total_pages ?? 1))} className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        </article>

        <aside className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Detalle</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">Ficha del estudiante</h3>
          {selectedStudent ? (
            <div className="mt-6 space-y-4 text-sm text-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slateBlue text-slate-500">
                  <UserRound className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedStudent.nombre_completo}</p>
                  <p>{selectedStudent.code}</p>
                </div>
              </div>
              <p><span className="font-semibold text-slate-900">Centro:</span> {selectedStudent.educational_center?.name}</p>
              <p><span className="font-semibold text-slate-900">Curso:</span> {selectedStudent.curso} {selectedStudent.paralelo}</p>
              <p><span className="font-semibold text-slate-900">Nivel:</span> {selectedStudent.nivel}</p>
              <p><span className="font-semibold text-slate-900">Turno:</span> {selectedStudent.turno}</p>
              <p><span className="font-semibold text-slate-900">Nacimiento:</span> {formatDate(selectedStudent.fecha_nacimiento)}</p>
              <p><span className="font-semibold text-slate-900">Edad:</span> {selectedStudent.edad}</p>
              <p><span className="font-semibold text-slate-900">CI:</span> {selectedStudent.ci ?? "Sin dato"}</p>
              <p><span className="font-semibold text-slate-900">RUDE:</span> {selectedStudent.rude ?? "Sin dato"}</p>
              <p><span className="font-semibold text-slate-900">GPS:</span> {selectedStudent.gps_device?.code ?? "Sin GPS"}</p>
              <p><span className="font-semibold text-slate-900">Estado:</span> {selectedStudent.status}</p>
              <p><span className="font-semibold text-slate-900">Contacto:</span> {selectedStudent.telefono_contacto || "Sin dato"}</p>
              <p><span className="font-semibold text-slate-900">Emergencia:</span> {selectedStudent.nombre_contacto_emergencia || "Sin dato"} {selectedStudent.telefono_contacto_emergencia ? `(${selectedStudent.telefono_contacto_emergencia})` : ""}</p>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">Selecciona un estudiante para ver su detalle.</div>
          )}
        </aside>
      </section>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">{formMode === "create" ? "Nuevo estudiante" : "Editar estudiante"}</h3>
              <button onClick={() => setFormMode(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["code", "Código"],
                ["nombres", "Nombres"],
                ["apellidos", "Apellidos"],
                ["fecha_nacimiento", "Fecha nacimiento"],
                ["ci", "CI"],
                ["rude", "RUDE"],
                ["curso", "Curso"],
                ["paralelo", "Paralelo"],
                ["direccion", "Dirección"],
                ["telefono_contacto", "Teléfono contacto"],
                ["nombre_contacto_emergencia", "Contacto emergencia"],
                ["telefono_contacto_emergencia", "Teléfono emergencia"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm text-slate-600">
                  {label}
                  <input
                    type={key === "fecha_nacimiento" ? "date" : "text"}
                    value={formState[key as keyof FormState] as string}
                    onChange={(event) => setFormState((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky"
                  />
                </label>
              ))}
              <label className="text-sm text-slate-600">Género
                <select value={formState.genero} onChange={(event) => setFormState((current) => ({ ...current, genero: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label className="text-sm text-slate-600">Nivel
                <select value={formState.nivel} onChange={(event) => setFormState((current) => ({ ...current, nivel: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="INICIAL">Inicial</option>
                  <option value="PRIMARIA">Primaria</option>
                  <option value="SECUNDARIA">Secundaria</option>
                </select>
              </label>
              <label className="text-sm text-slate-600">Turno
                <select value={formState.turno} onChange={(event) => setFormState((current) => ({ ...current, turno: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="MANANA">Mañana</option>
                  <option value="TARDE">Tarde</option>
                  <option value="NOCHE">Noche</option>
                </select>
              </label>
              <label className="text-sm text-slate-600">Centro educativo
                <select value={formState.educational_center_id} onChange={(event) => setFormState((current) => ({ ...current, educational_center_id: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="">Selecciona un centro</option>
                  {centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">GPS disponible
                <select value={formState.gps_device_id} onChange={(event) => setFormState((current) => ({ ...current, gps_device_id: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="">Sin GPS</option>
                  {gpsOptions.map((device) => <option key={device.id} value={device.id}>{device.code} - {device.model}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">Estado
                <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky">
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </label>
              <label className="text-sm text-slate-600 md:col-span-2">Motivo de desactivación
                <textarea value={formState.motivo_desactivacion} onChange={(event) => setFormState((current) => ({ ...current, motivo_desactivacion: event.target.value }))} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setFormMode(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">Cancelar</button>
              <button onClick={() => void submitStudent()} className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white">{saving ? "Guardando..." : formMode === "create" ? "Crear estudiante" : "Guardar cambios"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Cambiar estado</h3>
            <p className="mt-3 text-sm text-slate-600">Vas a cambiar el estado de <span className="font-semibold">{statusTarget.nombre_completo}</span>.</p>
            <textarea value={formState.motivo_desactivacion} onChange={(event) => setFormState((current) => ({ ...current, motivo_desactivacion: event.target.value }))} placeholder="Motivo de desactivación" className="mt-4 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky" />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStatusTarget(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">Cancelar</button>
              <button onClick={() => void submitStatusChange()} className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white">Confirmar</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Eliminar estudiante</h3>
            <p className="mt-3 text-sm text-slate-600">Se aplicará baja lógica a <span className="font-semibold">{deleteTarget.nombre_completo}</span>.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">Cancelar</button>
              <button onClick={() => void submitDelete()} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white">Eliminar</button>
            </div>
          </div>
        </div>
      ) : null}

      {historyTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">Historial de {historyTarget.nombre_completo}</h3>
              <button onClick={() => setHistoryTarget(null)} className="rounded-full border border-slate-200 p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6 space-y-4">
              {historyEntries.length ? historyEntries.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-sm text-slate-600">{entry.description}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(entry.created_at)} - {entry.performed_by ?? "Sistema"}</p>
                </article>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-slate-500">No hay historial disponible.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

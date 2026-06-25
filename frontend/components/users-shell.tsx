"use client";

import {
  AlertTriangle,
  Eye,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  authRequest,
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  getUserStats,
  RoleListItem,
  updateUser,
  updateUserStatus,
  UserDetail,
  UserListItem,
  UserStats,
  UsersResponse,
} from "@/lib/api";

type FilterState = {
  search: string;
  role: string;
  is_active: string;
};

type FormState = {
  id?: number;
  email: string;
  nombre: string;
  apellidos: string;
  role_id: string;
  is_active: boolean;
  password: string;
};

const initialFilters: FilterState = {
  search: "",
  role: "",
  is_active: "",
};

const initialForm: FormState = {
  email: "",
  nombre: "",
  apellidos: "",
  role_id: "",
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

export function UsersShell() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<FormState>(initialForm);
  const [statusTarget, setStatusTarget] = useState<UserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const assignableRoles = useMemo(
    () =>
      roles.filter((role) =>
        ["Administrador", "Regente", "Tutor"].includes(String(role.name ?? "").trim()),
      ),
    [roles],
  );

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [filters, page, pageSize]);

  async function loadBaseData() {
    try {
      const [statsData, rolesData] = await Promise.all([
        getUserStats(),
        authRequest<RoleListItem[]>("/roles/"),
      ]);
      setStats(statsData);
      setRoles(rolesData);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getUsers({ ...filters, page, page_size: pageSize });
      setUsersData(data);

      if (data.results.length > 0) {
        const nextId =
          selectedUser && data.results.some((user) => user.id === selectedUser.id)
            ? selectedUser.id
            : data.results[0].id;
        const detail = await getUserById(nextId);
        setSelectedUser(detail);
      } else {
        setSelectedUser(null);
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
      setErrorMessage("No tiene permisos para gestionar usuarios.");
      return;
    }

    setErrorMessage(message);
  }

  async function openDetail(userId: number) {
    try {
      const detail = await getUserById(userId);
      setSelectedUser(detail);
      setErrorMessage("");
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function openEditById(userId: number) {
    try {
      const detail = await getUserById(userId);
      setSelectedUser(detail);
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

  function openEdit(user: UserDetail) {
    setFormMode("edit");
    setFormState({
      id: user.id,
      email: user.email ?? "",
      nombre: user.nombre ?? "",
      apellidos: user.apellidos ?? "",
      role_id: user.role?.id ? String(user.role.id) : "",
      is_active: Boolean(user.is_active),
      password: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function submitUser() {
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

    if (!formState.role_id) {
      setSaving(false);
      setErrorMessage("El rol es obligatorio.");
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
        role_id: Number(formState.role_id),
        is_active: formState.is_active,
        ...(formState.password ? { password: formState.password } : {}),
      };

      const detail =
        formMode === "edit" && formState.id
          ? await updateUser(formState.id, payload)
          : await createUser(payload);

      setSelectedUser(detail);
      setFormMode(null);
      setSuccessMessage(
        formMode === "edit" ? "Usuario actualizado correctamente." : "Usuario creado correctamente.",
      );
      await Promise.all([loadBaseData(), loadUsers()]);
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
      const detail = await updateUserStatus(statusTarget.id, !statusTarget.is_active);
      setSelectedUser(detail);
      setStatusTarget(null);
      setSuccessMessage(
        detail.is_active ? "Usuario activado correctamente." : "Usuario inactivado correctamente.",
      );
      await Promise.all([loadBaseData(), loadUsers()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function removeUser() {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage(response.message ?? "Usuario inactivado correctamente.");
      await Promise.all([loadBaseData(), loadUsers()]);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  const metrics = [
    ["Total usuarios", stats?.total_usuarios ?? 0],
    ["Activos", stats?.activos ?? 0],
    ["Inactivos", stats?.inactivos ?? 0],
    ["Administradores", stats?.administradores ?? 0],
    ["Regentes", stats?.regentes ?? 0],
    ["Tutores", stats?.tutores ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Usuarios"
      eyebrow="Administración / Usuarios"
      title="Gestión de Usuarios"
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
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
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Panel de usuarios del sistema</h3>
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
              value={draftFilters.role}
              onChange={(event) => setDraftFilters((current) => ({ ...current, role: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
            >
              <option value="">Todos los roles</option>
              <option value="ADMIN">Administrador</option>
              <option value="REGENTE">Regente</option>
              <option value="TUTOR">Tutor</option>
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
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Usuarios registrados</h3>
            </div>
            <div className="flex items-center gap-3">
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
          </div>

          {loading ? (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">
              Cargando usuarios...
            </div>
          ) : usersData?.results?.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-4 font-medium">Usuario</th>
                    <th className="pb-4 font-medium">Rol</th>
                    <th className="pb-4 font-medium">Estado</th>
                    <th className="pb-4 font-medium">Último acceso</th>
                    <th className="pb-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.results.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="py-4">
                        <button
                          type="button"
                          onClick={() => void openDetail(user.id)}
                          className="text-left"
                        >
                          <p className="font-semibold text-slate-900">{user.nombre} {user.apellidos ?? ""}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </button>
                      </td>
                      <td className="py-4">{user.role?.name ?? user.rol}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(Boolean(user.is_active))}`}>
                          {user.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-4">{formatDateTime(user.last_login)}</td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(user.id)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEditById(user.id)}
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
                  Página {usersData.page ?? page} de {usersData.total_pages ?? 1}
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
                    disabled={page >= Number(usersData.total_pages ?? 1)}
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
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-4 text-lg font-semibold text-slate-900">No hay usuarios para mostrar</p>
              <p className="mt-2 text-sm text-slate-500">Ajusta los filtros o registra un nuevo usuario.</p>
            </div>
          )}
        </article>

        <aside className="rounded-[2rem] bg-white p-6 shadow-panel">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Detalle</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">Información del usuario</h3>

          {selectedUser ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-slate-900">{selectedUser.nombre} {selectedUser.apellidos ?? ""}</p>
                    <p className="mt-1 text-sm text-slate-500">{selectedUser.email}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(Boolean(selectedUser.is_active))}`}>
                    {selectedUser.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-900">Rol:</span> {selectedUser.role?.name ?? selectedUser.rol}</p>
                  <p><span className="font-semibold text-slate-900">Tipo:</span> {selectedUser.rol}</p>
                  <p><span className="font-semibold text-slate-900">Fecha de registro:</span> {formatDateTime(selectedUser.date_joined)}</p>
                  <p><span className="font-semibold text-slate-900">Último acceso:</span> {formatDateTime(selectedUser.last_login)}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(selectedUser)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" />
                  Editar usuario
                </button>
                <button
                  type="button"
                  onClick={() => setStatusTarget(selectedUser)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <UserCheck className="h-4 w-4" />
                  {selectedUser.is_active ? "Inactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(selectedUser)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Baja lógica
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 px-6 py-14 text-center text-slate-500">
              Selecciona un usuario para ver su detalle.
            </div>
          )}
        </aside>
      </section>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-10">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-sky">CU14 WEB</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  {formMode === "create" ? "Nuevo usuario" : "Editar usuario"}
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
                <span className="mb-2 block text-sm font-medium text-slate-700">Rol</span>
                <select
                  value={formState.role_id}
                  onChange={(event) => setFormState((current) => ({ ...current, role_id: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                >
                  <option value="">Seleccione un rol</option>
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  {formMode === "create" ? "Contraseña" : "Nueva contraseña opcional"}
                </span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky focus:bg-white"
                />
              </label>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={formState.is_active}
                  onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-sky focus:ring-sky"
                />
                Usuario activo
              </label>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitUser()}
                disabled={saving}
                className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Guardando..." : formMode === "create" ? "Crear usuario" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {statusTarget.is_active ? "Inactivar usuario" : "Activar usuario"}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  ¿Desea {statusTarget.is_active ? "inactivar" : "activar"} a <span className="font-semibold">{statusTarget.nombre}</span>?
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void changeStatus()}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Baja lógica del usuario</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Esta acción no elimina físicamente el registro; solo lo dejará inactivo en el sistema.
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void removeUser()}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Inactivar usuario
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

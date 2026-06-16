"use client";

import {
  CheckCircle2,
  Eye,
  FilePlus2,
  Pencil,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import { authRequest, Module, Permission, RoleDetail, RoleListItem, RoleStats } from "@/lib/api";

const actionsOrder = ["ver", "crear", "editar", "eliminar", "activar", "desactivar", "consultar"];

type FilterState = {
  search: string;
  is_active: string;
  created_at: string;
};

type RoleFormState = {
  id?: number;
  name: string;
  description: string;
  is_active: boolean;
  permissionIds: number[];
};

const initialFilters: FilterState = {
  search: "",
  is_active: "",
  created_at: "",
};

const initialForm: RoleFormState = {
  name: "",
  description: "",
  is_active: true,
  permissionIds: [],
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error al guardar. Intente nuevamente.";
}

export function RolesPermissionsShell() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [stats, setStats] = useState<RoleStats | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [draftFilters, setDraftFilters] = useState<FilterState>(initialFilters);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<RoleFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusTarget, setStatusTarget] = useState<RoleListItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const permissionsByModule = useMemo(() => {
    const map = new Map<number, Record<string, Permission>>();
    modules.forEach((module) => {
      map.set(module.id, {});
    });
    permissions.forEach((permission) => {
      const current = map.get(permission.module.id) ?? {};
      current[permission.action] = permission;
      map.set(permission.module.id, current);
    });
    return map;
  }, [modules, permissions]);

  useEffect(() => {
    void loadAll(filters);
  }, [filters]);

  async function loadAll(activeFilters: FilterState) {
    setLoading(true);
    setErrorMessage("");

    try {
      const query = new URLSearchParams();
      if (activeFilters.search) {
        query.set("search", activeFilters.search);
      }
      if (activeFilters.is_active) {
        query.set("is_active", activeFilters.is_active);
      }
      if (activeFilters.created_at) {
        query.set("created_at", activeFilters.created_at);
      }

      const [rolesData, modulesData, permissionsData, statsData] = await Promise.all([
        authRequest<RoleListItem[]>(`/roles/${query.toString() ? `?${query.toString()}` : ""}`),
        authRequest<Module[]>("/modules/"),
        authRequest<Permission[]>("/permissions/"),
        authRequest<RoleStats>("/roles/stats/"),
      ]);

      setRoles(rolesData);
      setModules(modulesData);
      setPermissions(permissionsData);
      setStats(statsData);

      if (rolesData.length > 0) {
        const nextSelectedId = selectedRole && rolesData.some((role) => role.id === selectedRole.id) ? selectedRole.id : rolesData[0].id;
        const detail = await authRequest<RoleDetail>(`/roles/${nextSelectedId}/`);
        setSelectedRole(detail);
      } else {
        setSelectedRole(null);
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

    if (status === 401 || status === 403) {
      setErrorMessage(message);
      clearSession();
      router.replace("/");
      return;
    }

    setErrorMessage(message);
  }

  async function loadRoleDetail(roleId: number) {
    try {
      const detail = await authRequest<RoleDetail>(`/roles/${roleId}/`);
      setSelectedRole(detail);
      setFormMode(null);
      setErrorMessage("");
    } catch (error) {
      handleProtectedError(error);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormState(initialForm);
    setErrorMessage("");
  }

  function openEdit(role: RoleDetail) {
    setFormMode("edit");
    setFormState({
      id: role.id,
      name: role.name,
      description: role.description,
      is_active: role.is_active,
      permissionIds: role.permissions.map((permission) => permission.id),
    });
    setErrorMessage("");
  }

  function togglePermission(permissionId: number) {
    setFormState((current) => {
      const exists = current.permissionIds.includes(permissionId);
      return {
        ...current,
        permissionIds: exists
          ? current.permissionIds.filter((id) => id !== permissionId)
          : [...current.permissionIds, permissionId],
      };
    });
  }

  async function submitRole() {
    setSaving(true);
    setErrorMessage("");

    if (!formState.name.trim()) {
      setSaving(false);
      setErrorMessage("El nombre del rol es obligatorio.");
      return;
    }

    if (formState.description.length > 200) {
      setSaving(false);
      setErrorMessage("La descripción no puede exceder 200 caracteres.");
      return;
    }

    if (formState.permissionIds.length === 0) {
      setSaving(false);
      setErrorMessage("Debe asignar al menos un permiso.");
      return;
    }

    try {
      const payload = {
        name: formState.name.trim(),
        description: formState.description.trim(),
        is_active: formState.is_active,
        permission_ids: formState.permissionIds,
      };

      const detail =
        formMode === "edit" && formState.id
          ? await authRequest<RoleDetail>(`/roles/${formState.id}/`, {
              method: "PUT",
              body: JSON.stringify(payload),
            })
          : await authRequest<RoleDetail>("/roles/", {
              method: "POST",
              body: JSON.stringify(payload),
            });

      setSelectedRole(detail);
      setFormMode(null);
      await loadAll(filters);
    } catch (error) {
      handleProtectedError(error);
    } finally {
      setSaving(false);
    }
  }

  async function changeRoleStatus() {
    if (!statusTarget) {
      return;
    }

    try {
      await authRequest<RoleListItem>(`/roles/${statusTarget.id}/status/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !statusTarget.is_active }),
      });
      setStatusTarget(null);
      await loadAll(filters);
    } catch (error) {
      handleProtectedError(error);
    }
  }

  async function deleteRole(roleId: number) {
    setDeletingId(roleId);
    setErrorMessage("");

    try {
      await authRequest<void>(`/roles/${roleId}/`, { method: "DELETE" });
      if (selectedRole?.id === roleId) {
        setSelectedRole(null);
      }
      await loadAll(filters);
    } catch (error) {
      handleProtectedError(error);
    } finally {
      setDeletingId(null);
    }
  }

  const summaryCards = [
    ["Total Roles", stats?.total_roles ?? 0],
    ["Roles Activos", stats?.active_roles ?? 0],
    ["Roles Inactivos", stats?.inactive_roles ?? 0],
    ["Permisos Totales", stats?.total_permissions ?? 0],
    ["Módulos", stats?.total_modules ?? 0],
  ];

  return (
    <AdminShell
      activeItem="Roles y Permisos"
      eyebrow="Administración de accesos"
      title="Gestión de Roles y Permisos"
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky"
        >
          <FilePlus2 className="h-4 w-4" />
          Nuevo Rol
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([title, value]) => (
          <article key={title} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{title}</p>
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
        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.8fr_0.8fr_auto_auto]">
          <input
            value={draftFilters.search}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Buscar por nombre o descripción"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
          <select
            value={draftFilters.is_active}
            onChange={(event) => setDraftFilters((current) => ({ ...current, is_active: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          >
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
          <input
            type="date"
            value={draftFilters.created_at}
            onChange={(event) => setDraftFilters((current) => ({ ...current, created_at: event.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
          />
          <button
            onClick={() => setFilters(draftFilters)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy"
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
          <button
            onClick={() => {
              setDraftFilters(initialFilters);
              setFilters(initialFilters);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Limpiar
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-4 font-medium">ID</th>
                  <th className="pb-4 font-medium">Rol</th>
                  <th className="pb-4 font-medium">Descripción</th>
                  <th className="pb-4 font-medium">Usuarios</th>
                  <th className="pb-4 font-medium">Estado</th>
                  <th className="pb-4 font-medium">Fecha de registro</th>
                  <th className="pb-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Cargando roles...
                    </td>
                  </tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No se encontraron roles.
                    </td>
                  </tr>
                ) : (
                  roles.map((role) => (
                    <tr key={role.id} className="text-slate-700">
                      <td className="py-4 font-semibold">{role.id}</td>
                      <td className="py-4 font-semibold">{role.name}</td>
                      <td className="py-4">{role.description || "Sin descripción"}</td>
                      <td className="py-4">{role.users_count}</td>
                      <td className="py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            role.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {role.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-4">{formatDate(role.created_at)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void loadRoleDetail(role.id)}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                            title="Ver"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (selectedRole && selectedRole.id === role.id) {
                                openEdit(selectedRole);
                              } else {
                                void authRequest<RoleDetail>(`/roles/${role.id}/`).then((detail) => {
                                  setSelectedRole(detail);
                                  openEdit(detail);
                                }).catch(handleProtectedError);
                              }
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setStatusTarget(role)}
                            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                            title={role.is_active ? "Desactivar" : "Activar"}
                          >
                            {role.is_active ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => void deleteRole(role.id)}
                            disabled={deletingId === role.id}
                            className="rounded-xl border border-red-200 p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {formMode === "create"
                  ? "Crear Nuevo Rol"
                  : formMode === "edit"
                    ? "Editar Rol"
                    : "Detalle del Rol"}
              </h3>
              {formMode ? (
                <button onClick={() => setFormMode(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {formMode ? (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Nombre del rol</label>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Descripción</label>
                  <textarea
                    value={formState.description}
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
                  />
                  <p className="mt-2 text-xs text-slate-400">{formState.description.length}/200</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Estado</label>
                  <select
                    value={formState.is_active ? "true" : "false"}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, is_active: event.target.value === "true" }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Matriz de permisos por módulo</h4>
                  <div className="mt-4 space-y-4">
                    {modules.map((module) => {
                      const permissionMap = permissionsByModule.get(module.id) ?? {};
                      return (
                        <div key={module.id} className="rounded-2xl border border-slate-200 p-4">
                          <p className="font-semibold text-slate-900">{module.name}</p>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            {actionsOrder.map((action) => {
                              const permission = permissionMap[action];
                              if (!permission) {
                                return null;
                              }
                              return (
                                <label key={permission.id} className="flex items-center gap-2 text-sm text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={formState.permissionIds.includes(permission.id)}
                                    onChange={() => togglePermission(permission.id)}
                                    className="h-4 w-4 rounded border-slate-300 text-sky focus:ring-sky"
                                  />
                                  {action}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => void submitRole()}
                  disabled={saving}
                  className="w-full rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky disabled:opacity-70"
                >
                  {saving ? "Guardando..." : formMode === "edit" ? "Actualizar Rol" : "Guardar Rol"}
                </button>
              </div>
            ) : selectedRole ? (
              <div className="mt-6 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Información del rol</p>
                  <h4 className="mt-2 text-2xl font-bold text-slate-900">{selectedRole.name}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRole.description || "Sin descripción registrada."}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <span className={`rounded-full px-3 py-1 font-semibold ${selectedRole.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {selectedRole.is_active ? "Activo" : "Inactivo"}
                    </span>
                    <span className="rounded-full bg-slateBlue px-3 py-1 font-semibold text-slate-700">
                      {selectedRole.users_count} usuarios
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Resumen de permisos</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slateBlue p-4">
                      <p className="text-xs text-slate-500">Permisos</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{selectedRole.permissions_summary.total_permissions}</p>
                    </div>
                    <div className="rounded-2xl bg-slateBlue p-4">
                      <p className="text-xs text-slate-500">Módulos</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{selectedRole.permissions_summary.total_modules}</p>
                    </div>
                    <div className="rounded-2xl bg-slateBlue p-4">
                      <p className="text-xs text-slate-500">Usuarios</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{selectedRole.users.length}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Módulos con permisos</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRole.modules_with_permissions.map((module) => (
                      <span key={module.code} className="rounded-full bg-sky/10 px-3 py-2 text-xs font-semibold text-sky">
                        {module.name}: {module.actions.join(", ")}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Permisos asignados</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRole.permissions.map((permission) => (
                      <span key={permission.id} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        {permission.module.name} / {permission.action}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usuarios</p>
                  <div className="mt-3 space-y-3">
                    {selectedRole.users.length > 0 ? (
                      selectedRole.users.map((user) => (
                        <div key={user.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <p className="font-semibold text-slate-900">{user.nombre}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No hay usuarios asignados.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-slate-500">Seleccione un rol para ver su detalle.</div>
            )}
          </article>
        </aside>
      </section>

      {statusTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-panel">
            <h3 className="text-xl font-bold text-slate-900">
              {statusTarget.is_active ? "¿Deseas desactivar este rol?" : "¿Deseas activar este rol?"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Se actualizará el estado del rol <span className="font-semibold">{statusTarget.name}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStatusTarget(null)}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void changeRoleStatus()}
                className="flex-1 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky"
              >
                {statusTarget.is_active ? "Desactivar Rol" : "Activar Rol"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

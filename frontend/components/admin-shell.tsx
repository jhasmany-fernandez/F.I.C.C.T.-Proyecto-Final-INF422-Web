"use client";

import {
  AlertTriangle,
  Bell,
  Building2,
  CircleUserRound,
  FileLock2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  MapPinned,
  Settings,
  Shield,
  UserCog,
  UserSquare2,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { clearSession, getStoredToken, getStoredUser } from "@/lib/auth";

const menuItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Usuarios", href: "#", icon: Users },
  { label: "Estudiantes", href: "#", icon: GraduationCap },
  { label: "Centros Educativos", href: "/centros-educativos", icon: Building2 },
  { label: "Áreas Seguras", href: "/areas-seguras", icon: MapPinned },
  { label: "Zonas de Riesgo", href: "/zonas-riesgo", icon: AlertTriangle },
  { label: "Asociación Tutor-Niño", href: "/asociacion-tutor-nino", icon: Link2 },
  { label: "Regentes", href: "#", icon: UserCog },
  { label: "Tutores", href: "#", icon: UserSquare2 },
  { label: "Tutores Responsables", href: "/tutores-responsables", icon: UsersRound },
  { label: "Niños Monitoreados", href: "/ninos-monitoreados", icon: CircleUserRound },
  { label: "Alertas de Seguridad", href: "/alertas-seguridad", icon: Bell },
  { label: "Roles y Permisos", href: "/roles-permisos", icon: FileLock2 },
  { label: "Reportes", href: "#", icon: FileText },
  { label: "Configuración", href: "#", icon: Settings },
  { label: "Auditoría", href: "#", icon: Shield },
  { label: "Mensajes", href: "#", icon: Mail },
];

type AdminShellProps = {
  activeItem: string;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminShell({ activeItem, eyebrow, title, actions, children }: AdminShellProps) {
  const router = useRouter();
  const [userName, setUserName] = useState("Administrador");

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token) {
      router.replace("/");
      return;
    }

    if (user?.nombre) {
      setUserName(user.nombre);
    }
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[290px_1fr]">
        <aside className="bg-navy px-6 py-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <LayoutDashboard className="h-6 w-6 text-sky-200" />
            </div>
            <div>
              <p className="text-sm text-sky-200">Sistema Escolar</p>
              <h1 className="text-xl font-bold">Panel Admin</h1>
            </div>
          </div>

          <nav className="mt-10 space-y-2">
            {menuItems.map(({ label, href, icon: Icon }) => {
              const isActive = label === activeItem;
              const sharedClasses = `flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${
                isActive ? "bg-white text-navy" : "text-slate-200 hover:bg-white/10"
              }`;

              return href === "#" ? (
                <button key={label} className={sharedClasses} type="button">
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ) : (
                <Link key={label} href={href} className={sharedClasses}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-10 flex items-center gap-3 rounded-2xl border border-white/15 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </aside>

        <main className="p-4 md:p-8">
          <header className="flex flex-col gap-4 rounded-[2rem] bg-white p-6 shadow-panel md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky">{eyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">{title}</h2>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {actions}
              <div className="flex items-center gap-4">
                <button className="relative rounded-2xl border border-slate-200 p-3 text-slate-600 transition hover:bg-slate-50">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sky" />
                </button>
                <div className="rounded-2xl bg-slateBlue px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Perfil</p>
                  <p className="text-sm font-semibold text-slate-900">{userName}</p>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

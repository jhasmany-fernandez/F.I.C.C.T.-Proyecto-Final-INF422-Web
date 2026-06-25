"use client";

import {
  AlertTriangle,
  Building2,
  Copy,
  Eye,
  MapPinned,
  Pencil,
  Plus,
  RefreshCcw,
  Ruler,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  ApiError,
  EducationalCenter,
  SafeArea,
  SafeAreaCoordinate,
  SafeAreaHistory,
  SafeAreaPolygon,
  SafeAreaStats,
  SafeAreaStatus,
  calculateSafeArea,
  createSafeArea,
  deleteSafeArea,
  getEducationalCenters,
  getSafeAreaByCenter,
  getSafeAreaHistory,
  getSafeAreaStats,
  updateSafeArea,
  updateSafeAreaStatus,
  validateSafeAreaPolygon,
} from "@/lib/api";

type DraftMode = "create" | "edit";

type FormErrors = {
  center?: string;
  name?: string;
  polygon?: string;
  general?: string;
};

const defaultPolygon: SafeAreaCoordinate[] = [
  [-84.0917, 9.9281],
  [-84.091, 9.9284],
  [-84.0901, 9.9282],
  [-84.09, 9.9274],
  [-84.0907, 9.9268],
  [-84.0918, 9.927],
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function formatDate(value?: string) {
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

function formatMetric(value?: string | number | null, suffix = "") {
  if (value === undefined || value === null || value === "") {
    return `0 ${suffix}`.trim();
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  return `${numeric.toLocaleString("es-BO", { maximumFractionDigits: 2 })} ${suffix}`.trim();
}

function historyLabel(action: string) {
  if (action === "CREACION") return "Creación";
  if (action === "ACTUALIZACION") return "Actualización";
  if (action === "ELIMINACION") return "Eliminación";
  if (action === "REEMPLAZO") return "Reemplazo";
  return action;
}

function statusTone(status?: SafeAreaStatus) {
  return status === "ACTIVA" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700";
}

function buildPolygon(points: SafeAreaCoordinate[]): SafeAreaPolygon {
  const ring = [...points];
  if (ring.length > 0) {
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng !== lastLng || firstLat !== lastLat) {
      ring.push([firstLng, firstLat]);
    }
  }
  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

function polygonToPoints(polygon?: SafeAreaPolygon | null) {
  const ring = polygon?.coordinates?.[0] ?? [];
  if (ring.length === 0) {
    return [];
  }
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last && first && last[0] === first[0] && last[1] === first[1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

function projectPoints(points: SafeAreaCoordinate[]) {
  if (points.length === 0) {
    return [];
  }

  const longitudes = points.map(([lng]) => lng);
  const latitudes = points.map(([, lat]) => lat);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const lngSpan = Math.max(maxLng - minLng, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);

  return points.map(([lng, lat]) => ({
    x: 40 + ((lng - minLng) / lngSpan) * 520,
    y: 260 - ((lat - minLat) / latSpan) * 220,
    lng,
    lat,
  }));
}

export function SafeAreasShell() {
  const router = useRouter();
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [stats, setStats] = useState<SafeAreaStats | null>(null);
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [selectedCenter, setSelectedCenter] = useState<EducationalCenter | null>(null);
  const [safeArea, setSafeArea] = useState<SafeArea | null>(null);
  const [history, setHistory] = useState<SafeAreaHistory[]>([]);
  const [points, setPoints] = useState<SafeAreaCoordinate[]>(defaultPolygon);
  const [draftName, setDraftName] = useState("Área segura principal");
  const [draftStatus, setDraftStatus] = useState<SafeAreaStatus>("ACTIVA");
  const [draftMode, setDraftMode] = useState<DraftMode>("create");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [metrics, setMetrics] = useState<{ area_m2: string; perimeter_m: string; points_count: number } | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const projectedPoints = useMemo(() => projectPoints(points), [points]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedCenterId) {
      return;
    }
    const nextCenter = centers.find((center) => center.id === Number(selectedCenterId)) ?? null;
    setSelectedCenter(nextCenter);
    void loadCenterArea(Number(selectedCenterId));
  }, [selectedCenterId, centers]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [centersData, statsData] = await Promise.all([getEducationalCenters(), getSafeAreaStats()]);
      const parsedCenters = Array.isArray(centersData) ? centersData : centersData.results ?? [];
      setCenters(parsedCenters);
      setStats(statsData);

      if (parsedCenters.length > 0) {
        setSelectedCenterId(String(parsedCenters[0].id));
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCenterArea(centerId: number) {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    setHistory([]);

    try {
      const detail = await getSafeAreaByCenter(centerId);
      setSafeArea(detail);
      setDraftMode("edit");
      setDraftName(detail.name);
      setDraftStatus(detail.status);
      setPoints(polygonToPoints(detail.polygon));
      setMetrics({
        area_m2: detail.area_m2,
        perimeter_m: detail.perimeter_m,
        points_count: detail.points_count,
      });
      const historyData = await getSafeAreaHistory(detail.id);
      setHistory(historyData);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 404) {
        setSafeArea(null);
        setDraftMode("create");
        setDraftName(selectedCenter ? `Área segura ${selectedCenter.name}` : "Área segura principal");
        setDraftStatus("ACTIVA");
        setPoints(defaultPolygon);
        setMetrics(null);
        setHistory([]);
        return;
      }
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

  function resetMessages() {
    setErrorMessage("");
    setSuccessMessage("");
    setFormErrors({});
  }

  function openNewDraft() {
    resetMessages();
    setSafeArea(null);
    setDraftMode("create");
    setDraftName(selectedCenter ? `Área segura ${selectedCenter.name}` : "Área segura principal");
    setDraftStatus("ACTIVA");
    setPoints(defaultPolygon);
    setMetrics(null);
    setHistory([]);
  }

  function loadExistingDraft() {
    if (!safeArea) {
      return;
    }
    resetMessages();
    setDraftMode("edit");
    setDraftName(safeArea.name);
    setDraftStatus(safeArea.status);
    setPoints(polygonToPoints(safeArea.polygon));
    setMetrics({
      area_m2: safeArea.area_m2,
      perimeter_m: safeArea.perimeter_m,
      points_count: safeArea.points_count,
    });
  }

  function addPoint() {
    resetMessages();
    const nextPoint =
      points.length === 0
        ? [-84.0917, 9.9281]
        : [Number((points[points.length - 1][0] + 0.0006).toFixed(6)), Number((points[points.length - 1][1] + 0.0002).toFixed(6))];
    setPoints((current) => [...current, nextPoint as SafeAreaCoordinate]);
  }

  function removePoint(index: number) {
    resetMessages();
    setPoints((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setSelectedPointIndex(null);
  }

  function updatePoint(index: number, axis: 0 | 1, value: string) {
    resetMessages();
    setPoints((current) =>
      current.map((point, currentIndex) => {
        if (currentIndex !== index) {
          return point;
        }
        const next = Number(value);
        if (Number.isNaN(next)) {
          return point;
        }
        return axis === 0 ? [next, point[1]] : [point[0], next];
      }),
    );
  }

  function moveSelected(deltaLng: number, deltaLat: number) {
    if (selectedPointIndex === null) {
      return;
    }
    resetMessages();
    setPoints((current) =>
      current.map((point, index) =>
        index === selectedPointIndex
          ? [Number((point[0] + deltaLng).toFixed(6)), Number((point[1] + deltaLat).toFixed(6))]
          : point,
      ),
    );
  }

  async function handleCalculate() {
    resetMessages();

    if (!selectedCenterId) {
      setFormErrors({ center: "Seleccione un centro educativo." });
      return;
    }
    if (!draftName.trim()) {
      setFormErrors({ name: "El nombre del área segura es obligatorio." });
      return;
    }
    if (points.length < 3) {
      setFormErrors({ polygon: "Debe registrar al menos 3 puntos válidos." });
      return;
    }

    setSaving(true);
    try {
      const polygon = buildPolygon(points);
      const validation = await validateSafeAreaPolygon(polygon);
      const calculation = await calculateSafeArea(polygon);
      setPoints(polygonToPoints(validation.polygon ?? polygon));
      setMetrics({
        area_m2: calculation.area_m2,
        perimeter_m: calculation.perimeter_m,
        points_count: calculation.points_count,
      });
      setSuccessMessage("Polígono validado correctamente en backend local.");
    } catch (error) {
      setFormErrors({ polygon: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    resetMessages();

    if (!selectedCenterId) {
      setFormErrors({ center: "Seleccione un centro educativo." });
      return;
    }
    if (!draftName.trim()) {
      setFormErrors({ name: "El nombre del área segura es obligatorio." });
      return;
    }
    if (points.length < 3) {
      setFormErrors({ polygon: "Debe registrar al menos 3 puntos válidos." });
      return;
    }

    setSaving(true);
    try {
      const polygon = buildPolygon(points);
      await validateSafeAreaPolygon(polygon);
      const payload = {
        educational_center_id: Number(selectedCenterId),
        name: draftName.trim(),
        status: draftStatus,
        polygon,
      };

      const saved =
        draftMode === "edit" && safeArea
          ? await updateSafeArea(safeArea.id, payload)
          : await createSafeArea(payload);

      setSafeArea(saved);
      setDraftMode("edit");
      setMetrics({
        area_m2: saved.area_m2,
        perimeter_m: saved.perimeter_m,
        points_count: saved.points_count,
      });
      setHistory(await getSafeAreaHistory(saved.id));
      setStats(await getSafeAreaStats());
      setSuccessMessage(draftMode === "edit" ? "Área segura actualizada." : "Área segura creada.");
    } catch (error) {
      setFormErrors({ general: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!safeArea) {
      return;
    }

    setSaving(true);
    resetMessages();
    try {
      const nextStatus: SafeAreaStatus = safeArea.status === "ACTIVA" ? "INACTIVA" : "ACTIVA";
      const updated = await updateSafeAreaStatus(safeArea.id, { status: nextStatus });
      setSafeArea(updated);
      setDraftStatus(updated.status);
      setStats(await getSafeAreaStats());
      setSuccessMessage(`Área segura ${nextStatus === "ACTIVA" ? "activada" : "desactivada"} correctamente.`);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!safeArea) {
      return;
    }

    setSaving(true);
    resetMessages();
    try {
      await deleteSafeArea(safeArea.id);
      setSafeArea(null);
      setDraftMode("create");
      setDraftStatus("ACTIVA");
      setDraftName(selectedCenter ? `Área segura ${selectedCenter.name}` : "Área segura principal");
      setMetrics(null);
      setHistory([]);
      setStats(await getSafeAreaStats());
      setSuccessMessage("Área segura eliminada.");
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  const polygonLabel = projectedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const polygonPreview = JSON.stringify(buildPolygon(points), null, 2);

  return (
    <AdminShell
      activeItem="Áreas Seguras"
      eyebrow="CU7 Web"
      title="Configurar Área Segura de Monitoreo"
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
            onClick={() => void handleCalculate()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Ruler className="h-4 w-4" />
            Validar polígono
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Total áreas</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats?.total_areas ?? 0}</p>
          </article>
          <article className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Activas</p>
            <p className="mt-3 text-3xl font-bold text-emerald-600">{stats?.activas ?? 0}</p>
          </article>
          <article className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Inactivas</p>
            <p className="mt-3 text-3xl font-bold text-slate-700">{stats?.inactivas ?? 0}</p>
          </article>
          <article className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Centros con área</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats?.centros_con_area ?? 0}</p>
          </article>
          <article className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Centros sin área</p>
            <p className="mt-3 text-3xl font-bold text-amber-600">{stats?.centros_sin_area ?? 0}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <article className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Mapa Local</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Editor de polígono GeoJSON</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Entorno de prueba sobre IP publica. El mapa es simulado en SVG y valida contra `http://35.238.201.88:8787`.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Centro educativo
                  <select
                    value={selectedCenterId}
                    onChange={(event) => setSelectedCenterId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
                  >
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.code} - {center.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Nombre del área
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
                    placeholder="Área segura principal"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addPoint}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Agregar punto
              </button>
              <button
                type="button"
                onClick={openNewDraft}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <MapPinned className="h-4 w-4" />
                Nuevo borrador
              </button>
              {safeArea ? (
                <button
                  type="button"
                  onClick={loadExistingDraft}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" />
                  Cargar actual
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPoints((current) => current.slice(0, Math.max(current.length - 1, 0)))}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Undo2 className="h-4 w-4" />
                Deshacer
              </button>
            </div>

            {(errorMessage || successMessage || formErrors.general || formErrors.center || formErrors.name || formErrors.polygon) && (
              <div className="mt-4 space-y-2">
                {errorMessage ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
                {successMessage ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p> : null}
                {formErrors.general ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formErrors.general}</p> : null}
                {formErrors.center ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.center}</p> : null}
                {formErrors.name ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.name}</p> : null}
                {formErrors.polygon ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.polygon}</p> : null}
              </div>
            )}

            <div className="mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-sm text-slate-200">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-sky-300" />
                  Vista local del polígono
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>{points.length} puntos</span>
                  <span className={`rounded-full px-3 py-1 ${statusTone(draftStatus)}`}>{draftStatus}</span>
                </div>
              </div>
              <svg viewBox="0 0 600 300" className="h-[320px] w-full bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.22),_transparent_40%),linear-gradient(180deg,rgba(15,23,42,1),rgba(2,6,23,1))]">
                <defs>
                  <pattern id="safe-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="600" height="300" fill="url(#safe-grid)" />
                {projectedPoints.length >= 3 ? (
                  <polygon points={polygonLabel} fill="rgba(56,189,248,0.28)" stroke="#38bdf8" strokeWidth="3" />
                ) : null}
                {projectedPoints.map((point, index) => (
                  <g key={`${point.lng}-${point.lat}-${index}`} onClick={() => setSelectedPointIndex(index)} className="cursor-pointer">
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={selectedPointIndex === index ? 8 : 6}
                      fill={selectedPointIndex === index ? "#f97316" : "#f8fafc"}
                      stroke="#0ea5e9"
                      strokeWidth="3"
                    />
                    <text x={point.x + 10} y={point.y - 10} fill="#e2e8f0" fontSize="12">
                      P{index + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => moveSelected(-0.0002, 0)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Oeste
              </button>
              <button
                type="button"
                onClick={() => moveSelected(0.0002, 0)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Este
              </button>
              <button
                type="button"
                onClick={() => moveSelected(0, 0.0002)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Norte
              </button>
              <button
                type="button"
                onClick={() => moveSelected(0, -0.0002)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Sur
              </button>
              {selectedPointIndex !== null ? (
                <button
                  type="button"
                  onClick={() => removePoint(selectedPointIndex)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar punto
                </button>
              ) : null}
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-sky" />
                <h3 className="text-xl font-bold text-slate-900">Resumen del centro</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Centro:</span> {selectedCenter?.name ?? "Sin selección"}</p>
                <p><span className="font-semibold text-slate-900">Código:</span> {selectedCenter?.code ?? "Sin código"}</p>
                <p><span className="font-semibold text-slate-900">Dirección:</span> {selectedCenter?.address ?? "Sin dirección"}</p>
                <p><span className="font-semibold text-slate-900">Estado del centro:</span> {selectedCenter?.status ?? "activo"}</p>
                <p><span className="font-semibold text-slate-900">Modo:</span> {draftMode === "edit" ? "Editar área existente" : "Crear nueva área"}</p>
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                <h3 className="text-xl font-bold text-slate-900">Métricas locales</h3>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Área:</span> {formatMetric(metrics?.area_m2, "m2")}</p>
                <p><span className="font-semibold text-slate-900">Perímetro:</span> {formatMetric(metrics?.perimeter_m, "m")}</p>
                <p><span className="font-semibold text-slate-900">Puntos reales:</span> {metrics?.points_count ?? points.length}</p>
                <p><span className="font-semibold text-slate-900">Última actualización:</span> {formatDate(safeArea?.updated_at)}</p>
              </div>

              {safeArea ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  >
                    <Pencil className="h-4 w-4" />
                    {safeArea.status === "ACTIVA" ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              ) : null}
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="text-xl font-bold text-slate-900">Observaciones locales</h3>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>Se valida contra la IP pública `35.238.201.88` además del entorno local.</li>
                <li>El editor usa una vista SVG simulada, suficiente para CRUD y validación GeoJSON.</li>
                <li>El backend exige coordenadas `[longitud, latitud]`, polígono cerrado y área mayor a 0.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <article className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Coordenadas</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Puntos del polígono</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                {points.length} puntos
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 pr-4">Punto</th>
                    <th className="pb-3 pr-4">Longitud</th>
                    <th className="pb-3 pr-4">Latitud</th>
                    <th className="pb-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map(([lng, lat], index) => (
                    <tr key={`${lng}-${lat}-${index}`} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-semibold text-slate-900">P{index + 1}</td>
                      <td className="py-3 pr-4">
                        <input
                          value={lng}
                          onFocus={() => setSelectedPointIndex(index)}
                          onChange={(event) => updatePoint(index, 0, event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none transition focus:border-sky-400"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          value={lat}
                          onFocus={() => setSelectedPointIndex(index)}
                          onChange={(event) => updatePoint(index, 1, event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none transition focus:border-sky-400"
                        />
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => removePoint(index)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          <X className="h-4 w-4" />
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">GeoJSON</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Vista previa del payload</h3>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(polygonPreview)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-[1.5rem] bg-slate-950 p-4 text-xs text-slate-200">{polygonPreview}</pre>
          </article>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky">Historial</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Trazabilidad de cambios</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              {history.length} eventos
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 pr-4">Acción</th>
                  <th className="pb-3 pr-4">Usuario</th>
                  <th className="pb-3 pr-4">Puntos</th>
                  <th className="pb-3 pr-4">Área nueva</th>
                  <th className="pb-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {history.length > 0 ? (
                  history.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-semibold text-slate-900">{historyLabel(entry.action)}</td>
                      <td className="py-3 pr-4 text-slate-600">{entry.user ?? "Sistema"}</td>
                      <td className="py-3 pr-4 text-slate-600">{entry.points_count}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatMetric(entry.new_area_m2, "m2")}</td>
                      <td className="py-3 text-slate-600">{formatDate(entry.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                      No hay historial todavía para el centro seleccionado.
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

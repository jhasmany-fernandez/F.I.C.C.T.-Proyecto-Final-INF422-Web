"use client";

import {
  AlertTriangle,
  Building2,
  Eye,
  MapPinned,
  Pencil,
  Plus,
  RefreshCcw,
  Ruler,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  ApiError,
  calculateRiskZone,
  createRiskZone,
  deleteRiskZone,
  EducationalCenter,
  getEducationalCenters,
  getRiskZoneById,
  getRiskZones,
  getRiskZoneStats,
  RiskZone,
  RiskZoneLevel,
  RiskZoneMetrics,
  RiskZonePayload,
  RiskZoneStats,
  RiskZoneType,
  SafeAreaCoordinate,
  SafeAreaPolygon,
  updateRiskZone,
  updateRiskZoneStatus,
  validateRiskZonePolygon,
} from "@/lib/api";

type DraftMode = "create" | "edit";

type FilterState = {
  search: string;
  educational_center_id: string;
  risk_type: string;
  risk_level: string;
  status: string;
};

type FormErrors = {
  name?: string;
  polygon?: string;
  general?: string;
};

const defaultPolygon: SafeAreaCoordinate[] = [
  [-63.1818, -17.7838],
  [-63.1812, -17.7836],
  [-63.181, -17.7841],
  [-63.1816, -17.7843],
];

const riskTypeLabels: Record<RiskZoneType, string> = {
  DELINCUENCIA: "Delincuencia",
  TRAFICO: "Tráfico",
  OBRA: "Obra",
  RIO_CANAL: "Río / canal",
  ZONA_OSCURA: "Zona oscura",
  OTRO: "Otro",
};

const riskLevelLabels: Record<RiskZoneLevel, string> = {
  ALTO: "Alto",
  MEDIO: "Medio",
  BAJO: "Bajo",
  INFORMATIVO: "Informativo",
};

const MAP_WIDTH = 768;
const MAP_HEIGHT = 384;
const MAP_ZOOM = 17;
const TILE_SIZE = 256;

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

function longitudeToWorldX(longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  return ((longitude + 180) / 360) * scale;
}

function latitudeToWorldY(latitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitudeRad = (latitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) / 2) * scale;
}

function worldXToLongitude(worldX: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  return (worldX / scale) * 360 - 180;
}

function worldYToLatitude(worldY: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const mercator = Math.PI - (2 * Math.PI * worldY) / scale;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercator) - Math.exp(-mercator)));
}

function createMapViewport(points: SafeAreaCoordinate[]) {
  const source = points.length > 0 ? points : defaultPolygon;
  const centerLongitude = source.reduce((sum, [lng]) => sum + lng, 0) / source.length;
  const centerLatitude = source.reduce((sum, [, lat]) => sum + lat, 0) / source.length;
  const centerWorldX = longitudeToWorldX(centerLongitude, MAP_ZOOM);
  const centerWorldY = latitudeToWorldY(centerLatitude, MAP_ZOOM);
  const topLeftWorldX = centerWorldX - MAP_WIDTH / 2;
  const topLeftWorldY = centerWorldY - MAP_HEIGHT / 2;
  const maxTileIndex = 2 ** MAP_ZOOM;

  const startTileX = Math.floor(topLeftWorldX / TILE_SIZE);
  const endTileX = Math.floor((topLeftWorldX + MAP_WIDTH) / TILE_SIZE);
  const startTileY = Math.floor(topLeftWorldY / TILE_SIZE);
  const endTileY = Math.floor((topLeftWorldY + MAP_HEIGHT) / TILE_SIZE);

  const tiles = [];
  for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= maxTileIndex) {
        continue;
      }
      const normalizedTileX = ((tileX % maxTileIndex) + maxTileIndex) % maxTileIndex;
      tiles.push({
        key: `${normalizedTileX}-${tileY}`,
        left: tileX * TILE_SIZE - topLeftWorldX,
        top: tileY * TILE_SIZE - topLeftWorldY,
        src: `https://tile.openstreetmap.org/${MAP_ZOOM}/${normalizedTileX}/${tileY}.png`,
      });
    }
  }

  const projectedPoints = points.map(([lng, lat]) => ({
    x: longitudeToWorldX(lng, MAP_ZOOM) - topLeftWorldX,
    y: latitudeToWorldY(lat, MAP_ZOOM) - topLeftWorldY,
    lng,
    lat,
  }));

  return {
    topLeftWorldX,
    topLeftWorldY,
    tiles,
    projectedPoints,
  };
}

function statusTone(isActive: boolean) {
  return isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700";
}

export function RiskZonesShell() {
  const router = useRouter();
  const [centers, setCenters] = useState<EducationalCenter[]>([]);
  const [stats, setStats] = useState<RiskZoneStats | null>(null);
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<RiskZone | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    educational_center_id: "",
    risk_type: "",
    risk_level: "",
    status: "",
  });
  const [draftMode, setDraftMode] = useState<DraftMode>("create");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCenterId, setDraftCenterId] = useState("GENERAL");
  const [draftRiskType, setDraftRiskType] = useState<RiskZoneType>("TRAFICO");
  const [draftRiskLevel, setDraftRiskLevel] = useState<RiskZoneLevel>("MEDIO");
  const [draftIsActive, setDraftIsActive] = useState(true);
  const [points, setPoints] = useState<SafeAreaCoordinate[]>(defaultPolygon);
  const [metrics, setMetrics] = useState<RiskZoneMetrics | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const mapViewport = useMemo(() => createMapViewport(points), [points]);
  const projectedPoints = mapViewport.projectedPoints;
  const polygonPreview = useMemo(() => JSON.stringify(buildPolygon(points), null, 2), [points]);
  const polygonLabel = projectedPoints.map((point) => `${point.x},${point.y}`).join(" ");

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const [centersData, statsData] = await Promise.all([getEducationalCenters(), getRiskZoneStats()]);
      setCenters(Array.isArray(centersData) ? centersData : centersData.results ?? []);
      setStats(statsData);
      await loadZones();
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadZones(nextFilters: FilterState = filters) {
    const response = await getRiskZones(nextFilters);
    setZones(response.results);
    if (response.results.length > 0) {
      const nextSelected = selectedZone
        ? response.results.find((zone) => zone.id === selectedZone.id) ?? response.results[0]
        : response.results[0];
      setSelectedZone(nextSelected);
    } else {
      setSelectedZone(null);
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

  function openCreateDraft() {
    resetMessages();
    setDraftMode("create");
    setDraftId(null);
    setDraftName("");
    setDraftDescription("");
    setDraftCenterId("GENERAL");
    setDraftRiskType("TRAFICO");
    setDraftRiskLevel("MEDIO");
    setDraftIsActive(true);
    setPoints(defaultPolygon);
    setMetrics(null);
    setSelectedPointIndex(null);
  }

  async function openEditDraft(zoneId: number) {
    resetMessages();
    try {
      const detail = await getRiskZoneById(zoneId);
      setSelectedZone(detail);
      setDraftMode("edit");
      setDraftId(detail.id);
      setDraftName(detail.name);
      setDraftDescription(detail.description);
      setDraftCenterId(detail.educational_center ? String(detail.educational_center.id) : "GENERAL");
      setDraftRiskType(detail.risk_type);
      setDraftRiskLevel(detail.risk_level);
      setDraftIsActive(detail.is_active);
      setPoints(polygonToPoints(detail.polygon));
      setMetrics({
        area_m2: detail.area_m2,
        perimeter_m: detail.perimeter_m,
        points_count: polygonToPoints(detail.polygon).length,
        is_valid: true,
        center_latitude: detail.center_latitude ?? undefined,
        center_longitude: detail.center_longitude ?? undefined,
      });
    } catch (error) {
      handleApiError(error);
    }
  }

  function addPoint() {
    const last = points[points.length - 1] ?? defaultPolygon[defaultPolygon.length - 1];
    setPoints((current) => [...current, [Number((last[0] + 0.0004).toFixed(6)), Number((last[1] + 0.0004).toFixed(6))]]);
  }

  function removeSelectedPoint() {
    if (selectedPointIndex === null) {
      return;
    }
    setPoints((current) => current.filter((_, index) => index !== selectedPointIndex));
    setSelectedPointIndex(null);
  }

  function updatePoint(index: number, axis: 0 | 1, value: string) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return;
    }
    setPoints((current) =>
      current.map((point, pointIndex) => (pointIndex === index ? [axis === 0 ? numeric : point[0], axis === 1 ? numeric : point[1]] : point)),
    );
  }

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT;
    const longitude = worldXToLongitude(mapViewport.topLeftWorldX + x, MAP_ZOOM);
    const latitude = worldYToLatitude(mapViewport.topLeftWorldY + y, MAP_ZOOM);
    const nextPoint: SafeAreaCoordinate = [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
    setPoints((current) => [...current, nextPoint]);
    setSelectedPointIndex(points.length);
  }

  async function handleValidateAndCalculate() {
    resetMessages();
    if (points.length < 3) {
      setFormErrors({ polygon: "Debe registrar al menos 3 puntos reales." });
      return;
    }

    try {
      const polygon = buildPolygon(points);
      const validation = await validateRiskZonePolygon(polygon);
      const calculation = await calculateRiskZone(polygon);
      setPoints(polygonToPoints(validation.polygon ?? polygon));
      setMetrics({
        area_m2: calculation.area_m2,
        perimeter_m: calculation.perimeter_m,
        points_count: calculation.points_count,
        is_valid: calculation.is_valid,
        center_latitude: calculation.center_latitude,
        center_longitude: calculation.center_longitude,
      });
      setSuccessMessage("Polígono validado y métricas calculadas correctamente.");
    } catch (error) {
      setFormErrors({ polygon: getErrorMessage(error) });
    }
  }

  async function handleSubmit() {
    resetMessages();
    if (!draftName.trim()) {
      setFormErrors({ name: "El nombre es obligatorio." });
      return;
    }
    if (points.length < 3) {
      setFormErrors({ polygon: "Debe registrar al menos 3 puntos reales." });
      return;
    }

    setSaving(true);
    try {
      const polygon = buildPolygon(points);
      await validateRiskZonePolygon(polygon);
      const payload: RiskZonePayload = {
        educational_center_id: draftCenterId === "GENERAL" ? null : Number(draftCenterId),
        name: draftName.trim(),
        description: draftDescription.trim(),
        risk_type: draftRiskType,
        risk_level: draftRiskLevel,
        polygon,
        is_active: draftIsActive,
      };

      const saved = draftMode === "create" ? await createRiskZone(payload) : await updateRiskZone(draftId!, payload);
      setSelectedZone(saved);
      setSuccessMessage(draftMode === "create" ? "Zona de riesgo registrada." : "Zona de riesgo actualizada.");
      setDraftMode("edit");
      setDraftId(saved.id);
      setMetrics({
        area_m2: saved.area_m2,
        perimeter_m: saved.perimeter_m,
        points_count: polygonToPoints(saved.polygon).length,
        is_valid: true,
        center_latitude: saved.center_latitude ?? undefined,
        center_longitude: saved.center_longitude ?? undefined,
      });
      await Promise.all([loadZones(), refreshStats()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  async function refreshStats() {
    const nextStats = await getRiskZoneStats();
    setStats(nextStats);
  }

  async function handleDelete(zoneId: number) {
    resetMessages();
    if (!window.confirm("¿Deseas eliminar esta zona de riesgo?")) {
      return;
    }
    try {
      await deleteRiskZone(zoneId);
      setSuccessMessage("Zona de riesgo eliminada.");
      if (draftId === zoneId) {
        openCreateDraft();
      }
      await Promise.all([loadZones(), refreshStats()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function handleToggleStatus(zone: RiskZone) {
    resetMessages();
    try {
      const updated = await updateRiskZoneStatus(zone.id, { is_active: !zone.is_active });
      if (selectedZone?.id === zone.id) {
        setSelectedZone(updated);
      }
      if (draftId === zone.id) {
        setDraftIsActive(updated.is_active);
      }
      setSuccessMessage(updated.is_active ? "Zona activada correctamente." : "Zona desactivada correctamente.");
      await Promise.all([loadZones(), refreshStats()]);
    } catch (error) {
      handleApiError(error);
    }
  }

  async function applyFilters() {
    resetMessages();
    try {
      await loadZones(filters);
    } catch (error) {
      handleApiError(error);
    }
  }

  function levelBarEntries(source?: Record<string, number>) {
    if (!source) {
      return [];
    }
    return Object.entries(source);
  }

  return (
    <AdminShell
      activeItem="Zonas de Riesgo"
      eyebrow="CU14 Web"
      title="Gestionar Zonas de Riesgo"
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
            onClick={openCreateDraft}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky px-4 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Registrar zona
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-5">
          <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">Total</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats?.total_zones ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">Activas</p>
            <p className="mt-3 text-3xl font-bold text-emerald-600">{stats?.activas ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">Inactivas</p>
            <p className="mt-3 text-3xl font-bold text-slate-700">{stats?.inactivas ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">Generales</p>
            <p className="mt-3 text-3xl font-bold text-amber-600">{stats?.zonas_generales ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">Por centro</p>
            <p className="mt-3 text-3xl font-bold text-indigo-600">{stats?.zonas_por_centro ?? 0}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Listado</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">Zonas registradas</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                {zones.length} visibles
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-5">
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Nombre o descripción"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
              />
              <select
                value={filters.educational_center_id}
                onChange={(event) => setFilters((current) => ({ ...current, educational_center_id: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
              >
                <option value="">Todos los centros</option>
                <option value="GENERAL">Zona general</option>
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.risk_type}
                onChange={(event) => setFilters((current) => ({ ...current, risk_type: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
              >
                <option value="">Todos los tipos</option>
                {Object.entries(riskTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={filters.risk_level}
                onChange={(event) => setFilters((current) => ({ ...current, risk_level: event.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
              >
                <option value="">Todos los niveles</option>
                {(["ALTO", "MEDIO", "BAJO", "INFORMATIVO"] as RiskZoneLevel[]).map((value) => (
                  <option key={value} value={value}>
                    {riskLevelLabels[value]}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                >
                  <option value="">Todos</option>
                  <option value="activo">Activas</option>
                  <option value="inactivo">Inactivas</option>
                </select>
                <button
                  type="button"
                  onClick={() => void applyFilters()}
                  className="rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Filtrar
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 pr-4">Código</th>
                    <th className="pb-3 pr-4">Nombre</th>
                    <th className="pb-3 pr-4">Centro</th>
                    <th className="pb-3 pr-4">Tipo</th>
                    <th className="pb-3 pr-4">Nivel</th>
                    <th className="pb-3 pr-4">Estado</th>
                    <th className="pb-3 pr-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id} className="border-b border-slate-100 align-top">
                      <td className="py-4 pr-4 font-semibold text-slate-700">{zone.code}</td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-slate-900">{zone.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{zone.description || "Sin descripción"}</p>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{zone.educational_center?.name ?? "General"}</td>
                      <td className="py-4 pr-4 text-slate-600">{riskTypeLabels[zone.risk_type]}</td>
                      <td className="py-4 pr-4 text-slate-600">{riskLevelLabels[zone.risk_level]}</td>
                      <td className="py-4 pr-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(zone.is_active)}`}>
                          {zone.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedZone(zone)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEditDraft(zone.id)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(zone)}
                            className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(zone.id)}
                            className="rounded-2xl border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && zones.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  No hay zonas que coincidan con los filtros actuales.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-sky">Detalle</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Vista rápida</h3>
            {selectedZone ? (
              <div className="mt-6 space-y-4 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Código:</span> {selectedZone.code}</p>
                <p><span className="font-semibold text-slate-900">Centro:</span> {selectedZone.educational_center?.name ?? "General"}</p>
                <p><span className="font-semibold text-slate-900">Tipo:</span> {riskTypeLabels[selectedZone.risk_type]}</p>
                <p><span className="font-semibold text-slate-900">Nivel:</span> {riskLevelLabels[selectedZone.risk_level]}</p>
                <p><span className="font-semibold text-slate-900">Área:</span> {formatMetric(selectedZone.area_m2, "m2")}</p>
                <p><span className="font-semibold text-slate-900">Perímetro:</span> {formatMetric(selectedZone.perimeter_m, "m")}</p>
                <p><span className="font-semibold text-slate-900">Centroide:</span> {selectedZone.center ? `${selectedZone.center.latitude}, ${selectedZone.center.longitude}` : "Sin centroide"}</p>
                <p><span className="font-semibold text-slate-900">Creado por:</span> {selectedZone.created_by ?? "Sin registro"}</p>
                <p><span className="font-semibold text-slate-900">Actualizado por:</span> {selectedZone.updated_by ?? "Sin registro"}</p>
                <p><span className="font-semibold text-slate-900">Actualizado:</span> {formatDate(selectedZone.updated_at)}</p>
                <button
                  type="button"
                  onClick={() => void openEditDraft(selectedZone.id)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  <Pencil className="h-4 w-4" />
                  Editar zona
                </button>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Selecciona una zona para ver su detalle.</p>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-sky">Formulario</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  {draftMode === "create" ? "Registrar zona" : "Editar zona"}
                </h3>
              </div>
              {draftMode === "edit" ? (
                <button
                  type="button"
                  onClick={openCreateDraft}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Nuevo borrador
                </button>
              ) : null}
            </div>

            {(errorMessage || successMessage || formErrors.name || formErrors.polygon || formErrors.general) && (
              <div className="mt-6 space-y-3">
                {errorMessage ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
                {successMessage ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</p> : null}
                {formErrors.name ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.name}</p> : null}
                {formErrors.polygon ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.polygon}</p> : null}
                {formErrors.general ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{formErrors.general}</p> : null}
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Nombre</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                  placeholder="Zona de tráfico alto San Martín"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Centro educativo</span>
                <select
                  value={draftCenterId}
                  onChange={(event) => setDraftCenterId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                >
                  <option value="GENERAL">Zona general</option>
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Tipo de riesgo</span>
                <select
                  value={draftRiskType}
                  onChange={(event) => setDraftRiskType(event.target.value as RiskZoneType)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                >
                  {Object.entries(riskTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Nivel de riesgo</span>
                <select
                  value={draftRiskLevel}
                  onChange={(event) => setDraftRiskLevel(event.target.value as RiskZoneLevel)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                >
                  {(["ALTO", "MEDIO", "BAJO", "INFORMATIVO"] as RiskZoneLevel[]).map((value) => (
                    <option key={value} value={value}>
                      {riskLevelLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Descripción</span>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                  placeholder="Describe por qué esta zona debe monitorearse."
                />
              </label>
            </div>

            <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Editor de polígono</p>
                  <h4 className="mt-2 text-lg font-bold text-slate-900">Mapa base OpenStreetMap y coordenadas</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addPoint}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Agregar punto
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedPoint}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Quitar punto
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleValidateAndCalculate()}
                    className="rounded-2xl bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Validar y calcular
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                  <div
                    onClick={handleMapClick}
                    className="relative h-[384px] w-full cursor-crosshair overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-200"
                  >
                    {mapViewport.tiles.map((tile) => (
                      <img
                        key={tile.key}
                        src={tile.src}
                        alt=""
                        className="pointer-events-none absolute max-w-none select-none"
                        style={{
                          left: `${tile.left}px`,
                          top: `${tile.top}px`,
                          width: `${TILE_SIZE}px`,
                          height: `${TILE_SIZE}px`,
                        }}
                      />
                    ))}
                    <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />
                    <svg
                      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                      className="absolute inset-0 h-full w-full"
                      aria-label="Mapa interactivo para polígono"
                    >
                      {projectedPoints.length >= 3 ? (
                        <polygon points={polygonLabel} fill="rgba(248,113,113,0.28)" stroke="#ea580c" strokeWidth="3" />
                      ) : null}
                      {projectedPoints.map((point, index) => (
                        <g key={`${point.lng}-${point.lat}-${index}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={selectedPointIndex === index ? 9 : 7}
                            fill={selectedPointIndex === index ? "#0f172a" : "#f8fafc"}
                            stroke="#38bdf8"
                            strokeWidth="3"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPointIndex(index);
                            }}
                            className="cursor-pointer"
                          />
                          <text x={point.x + 10} y={point.y - 12} fill="#0f172a" fontSize="12" fontWeight="700">
                            P{index + 1}
                          </text>
                        </g>
                      ))}
                    </svg>
                    <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      Clic en el mapa: agrega un punto
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Base cartográfica: OpenStreetMap. Puedes agregar puntos con clic y ajustar coordenadas desde el panel derecho.
                  </p>
                </div>

                <div className="space-y-3">
                  {points.map((point, index) => (
                    <div
                      key={`${index}-${point[0]}-${point[1]}`}
                      className={`rounded-[1.25rem] border p-3 ${selectedPointIndex === index ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">Punto {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedPointIndex(index)}
                          className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                        >
                          Seleccionar
                        </button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          value={point[0]}
                          onChange={(event) => updatePoint(index, 0, event.target.value)}
                          className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-400"
                        />
                        <input
                          value={point[1]}
                          onChange={(event) => updatePoint(index, 1, event.target.value)}
                          className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-[1.5rem] bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Área</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{formatMetric(metrics?.area_m2, "m2")}</p>
              </div>
              <div className="rounded-[1.5rem] bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Perímetro</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{formatMetric(metrics?.perimeter_m, "m")}</p>
              </div>
              <div className="rounded-[1.5rem] bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Centroide</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {metrics?.center_latitude && metrics?.center_longitude
                    ? `${metrics.center_latitude}, ${metrics.center_longitude}`
                    : "Pendiente"}
                </p>
              </div>
              <label className="flex items-center gap-3 rounded-[1.5rem] bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={draftIsActive}
                  onChange={(event) => setDraftIsActive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Estado</p>
                  <p className="text-sm font-semibold text-slate-900">{draftIsActive ? "Activa" : "Inactiva"}</p>
                </div>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar zona"}
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(polygonPreview)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Copiar GeoJSON
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <MapPinned className="h-5 w-5 text-sky" />
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-sky">GeoJSON</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Polígono actual</h3>
                </div>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-[1.5rem] bg-slate-950 p-4 text-xs text-slate-200">{polygonPreview}</pre>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <Ruler className="h-5 w-5 text-sky" />
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-sky">Distribución</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Métricas y niveles</h3>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {levelBarEntries(stats?.by_type).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{riskTypeLabels[key as RiskZoneType] ?? key}</span>
                      <span className="text-slate-500">{value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-sky"
                        style={{ width: `${stats?.total_zones ? Math.max((value / stats.total_zones) * 100, 6) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                {levelBarEntries(stats?.by_level).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{riskLevelLabels[key as RiskZoneLevel] ?? key}</span>
                      <span className="text-slate-500">{value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${stats?.total_zones ? Math.max((value / stats.total_zones) * 100, 6) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-sky" />
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-sky">Reglas</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Criterios operativos</h3>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>Solo administradores pueden crear, editar, activar o eliminar zonas de riesgo.</li>
                <li>Se permite asociar una zona a un centro educativo o dejarla como zona general.</li>
                <li>El GeoJSON debe ser un polígono válido, cerrado y con al menos 3 puntos reales.</li>
                <li>El sistema calcula área, perímetro y centroide antes de guardar.</li>
                <li>Se bloquean duplicados por nombre dentro del mismo centro o dentro del grupo general.</li>
              </ul>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-sky" />
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-sky">Integración</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Flujo automático</h3>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>Las zonas activas por centro y las generales quedan disponibles para monitoreo.</li>
                <li>Si un niño ingresa a una zona activa, el módulo de monitoreo puede generar alerta.</li>
                <li>Desactivar una zona la excluye de nuevas detecciones sin borrar el resto del historial.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

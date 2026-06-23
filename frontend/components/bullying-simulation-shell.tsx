"use client";

import { AlertTriangle, Clapperboard, RefreshCcw, ShieldAlert, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession, getStoredUser } from "@/lib/auth";
import {
  ApiError,
  getBullyingSimulationOptions,
  getBullyingSimulations,
  processBullyingSimulation,
} from "@/lib/api";

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la solicitud.";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin dato";
  return new Date(value).toLocaleString("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultTone(result: string) {
  if (result === "BULLYING_DETECTADO") return "bg-rose-100 text-rose-700";
  return "bg-emerald-100 text-emerald-700";
}

export function BullyingSimulationShell() {
  const router = useRouter();
  const [children, setChildren] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedVideoName, setSelectedVideoName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    setUserRole(getStoredUser()?.rol ?? "");
    void loadAll();
  }, []);

  const selectedVideo = useMemo(
    () => videos.find((item) => item.name === selectedVideoName) ?? null,
    [videos, selectedVideoName],
  );

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [optionsResponse, historyResponse] = await Promise.all([
        getBullyingSimulationOptions(),
        getBullyingSimulations(),
      ]);
      const options = optionsResponse.data ?? {};
      const nextChildren = options.children ?? [];
      const nextVideos = options.videos ?? [];
      setChildren(nextChildren);
      setVideos(nextVideos);
      setFolderPath(options.folder ?? "");
      setHistory(historyResponse.data ?? []);
      if (!selectedChildId && nextChildren.length > 0) {
        setSelectedChildId(String(nextChildren[0].id));
      }
      if (!selectedVideoName && nextVideos.length > 0) {
        setSelectedVideoName(nextVideos[0].name);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }

  function handleApiError(error: unknown) {
    const message = normalizeError(error);
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearSession();
      router.replace("/");
      return;
    }
    setErrorMessage(message);
  }

  async function handleProcess() {
    if (!selectedChildId || !selectedVideoName) {
      setErrorMessage("Selecciona un estudiante y un video para procesar.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await processBullyingSimulation({
        child_id: Number(selectedChildId),
        video_name: selectedVideoName,
      });
      setSuccessMessage(response.message ?? "Video procesado correctamente.");
      const historyResponse = await getBullyingSimulations();
      setHistory(historyResponse.data ?? []);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  }

  const summaryCards = [
    { label: "Videos disponibles", value: videos.length, icon: Video },
    {
      label: "Procesamientos registrados",
      value: history.length,
      icon: Clapperboard,
    },
    {
      label: "Detecciones positivas",
      value: history.filter((entry) => entry.result === "BULLYING_DETECTADO").length,
      icon: ShieldAlert,
    },
  ];

  return (
    <AdminShell
      activeItem="Detección de Bullying"
      eyebrow="Monitoreo inteligente"
      title="Detección de Bullying con Videos"
      actions={
        <button
          type="button"
          onClick={() => void loadAll()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-[1.75rem] bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon className="h-5 w-5 text-sky" />
            </div>
            <p className="mt-4 text-4xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-sky" />
            <h3 className="text-lg font-bold text-slate-900">Procesar video</h3>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Coloca los videos de prueba en <span className="font-semibold text-slate-700">{folderPath || "la carpeta configurada"}</span>.
            Si existe un archivo JSON con el mismo nombre base, se usa como referencia del resultado esperado.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <select
              value={selectedChildId}
              onChange={(event) => setSelectedChildId(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
              disabled={loading || children.length === 0}
            >
              <option value="">Selecciona un estudiante</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.nombre_completo} · {child.curso}
                </option>
              ))}
            </select>

            <select
              value={selectedVideoName}
              onChange={(event) => setSelectedVideoName(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky"
              disabled={loading || videos.length === 0}
            >
              <option value="">Selecciona un video</option>
              {videos.map((video) => (
                <option key={video.name} value={video.name}>
                  {video.name}
                </option>
              ))}
            </select>
          </div>

          {selectedVideo ? (
            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Video:</span> {selectedVideo.name}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Resultado esperado:</span> {selectedVideo.expected_result}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Nivel de confianza:</span> {selectedVideo.confidence_hint}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Resumen:</span> {selectedVideo.summary_hint}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Archivo metadata:</span> {selectedVideo.metadata_file ?? "No definido"}</p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}
          {successMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleProcess()}
              disabled={loading || saving || userRole !== "ADMIN"}
              className="rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? "Procesando..." : "Procesar y generar alerta"}
            </button>
            {userRole !== "ADMIN" ? (
              <p className="self-center text-sm text-slate-500">
                El procesamiento solo está habilitado para el administrador.
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <h3 className="text-lg font-bold text-slate-900">Referencia de procesamiento</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Usa nombres como <span className="font-semibold text-slate-900">bullying_aula_01.mp4</span> o <span className="font-semibold text-slate-900">normal_recreo_01.mp4</span>.</p>
            <p>Si necesitas controlar el resultado, crea un JSON con el mismo nombre base.</p>
            <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
{`{
  "result": "BULLYING_DETECTADO",
  "confidence": 0.91,
  "event_timestamp_seconds": 18,
  "summary": "Posible agresion fisica detectada entre estudiantes",
  "priority": "ALTA",
  "classroom": "Aula 5to A"
}`}
            </pre>
            <p>Cuando el resultado es positivo, el sistema crea una alerta real visible en web y móvil para el regente.</p>
          </div>
        </article>
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <h3 className="text-lg font-bold text-slate-900">Historial de procesamientos</h3>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="py-3 pr-4">Fecha</th>
                <th className="py-3 pr-4">Estudiante</th>
                <th className="py-3 pr-4">Video</th>
                <th className="py-3 pr-4">Resultado</th>
                <th className="py-3 pr-4">Confianza</th>
                <th className="py-3 pr-4">Alerta</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4">{formatDateTime(entry.created_at)}</td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-slate-900">{entry.child?.nombre_completo}</p>
                      <p>{entry.child?.curso}</p>
                    </td>
                    <td className="py-4 pr-4">{entry.source_video_name}</td>
                    <td className="py-4 pr-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resultTone(entry.result)}`}>
                        {entry.result}
                      </span>
                    </td>
                    <td className="py-4 pr-4">{entry.confidence}</td>
                    <td className="py-4 pr-4">
                      {entry.generated_alert ? (
                        <div>
                          <p className="font-semibold text-slate-900">{entry.generated_alert.code}</p>
                          <p>{entry.generated_alert.status}</p>
                        </div>
                      ) : (
                        <span>Sin alerta</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    {loading ? "Cargando procesamientos..." : "Aún no hay videos procesados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

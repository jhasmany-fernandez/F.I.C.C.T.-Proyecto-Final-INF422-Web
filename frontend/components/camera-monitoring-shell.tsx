"use client";

import {
  AlertTriangle,
  CameraOff,
  Cctv,
  CheckCircle2,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { clearSession } from "@/lib/auth";
import {
  ApiError,
  getBullyingSimulationOptions,
  getBullyingSimulations,
  processBullyingSimulation,
} from "@/lib/api";

const cameraFeeds = [
  {
    id: "CAM-01",
    name: "Aula 5to A",
    location: "Bloque A",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "https://www.youtube.com/embed/4_esxWiQwLM?autoplay=1&mute=1&controls=1&rel=0&vq=small&loop=1&playlist=4_esxWiQwLM",
  },
  {
    id: "CAM-02",
    name: "Aula 6to B",
    location: "Bloque A",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "http://localhost:8787/media/bullying-videos/Video%202026-06-19%20AM.mp4",
    videoName: "Video 2026-06-19 AM.mp4",
    childId: 2,
  },
  {
    id: "CAM-03",
    name: "Aula 4to A",
    location: "Bloque A",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "http://localhost:8787/media/bullying-videos/Video%202026-06-21%20AM.mp4",
    videoName: "Video 2026-06-21 AM.mp4",
    childId: 7,
  },
  {
    id: "CAM-04",
    name: "Aula 4to B",
    location: "Bloque B",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "http://localhost:8787/media/bullying-videos/Video%202026-06-23%20AM.mp4",
    videoName: "Video 2026-06-23 AM.mp4",
    childId: 3,
  },
  {
    id: "CAM-05",
    name: "Aula 1ro A",
    location: "Bloque B",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "http://localhost:8787/media/bullying-videos/Video%202026-60-20%20AM.mp4",
    videoName: "Video 2026-60-20 AM.mp4",
    childId: 4,
  },
  {
    id: "CAM-06",
    name: "Patio del colegio",
    location: "Área común",
    active: true,
    lastSignal: "En vivo",
    videoUrl: "https://www.youtube.com/embed/e4TWXJkOt4s?autoplay=1&mute=1&controls=1&rel=0&vq=small&loop=1&playlist=e4TWXJkOt4s",
  },
];

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

export function CameraMonitoringShell() {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [detectedVideoCount, setDetectedVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sendingCameraId, setSendingCameraId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    void loadReports();
  }, []);

  const activeCount = useMemo(() => cameraFeeds.filter((item) => item.active).length, []);
  const inactiveCount = cameraFeeds.length - activeCount;

  async function loadReports() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [reportsResponse, optionsResponse] = await Promise.all([
        getBullyingSimulations({ result: "BULLYING_DETECTADO" }),
        getBullyingSimulationOptions(),
      ]);
      setReports(Array.isArray(reportsResponse.data) ? reportsResponse.data : []);
      const videos = Array.isArray(optionsResponse.data?.videos) ? optionsResponse.data.videos : [];
      setDetectedVideoCount(
        videos.filter((video: any) => video.expected_result === "BULLYING_DETECTADO").length,
      );
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        router.replace("/");
        return;
      }
      setErrorMessage(normalizeError(error));
    } finally {
      setLoading(false);
    }
  }

  async function sendCameraAlert(camera: any) {
    if (!camera.childId || !camera.videoName) return;
    setSendingCameraId(camera.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await processBullyingSimulation({
        child_id: camera.childId,
        video_name: camera.videoName,
      });
      setSuccessMessage(`${camera.id}: ${response.message ?? "Alerta enviada correctamente."}`);
      await loadReports();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        router.replace("/");
        return;
      }
      setErrorMessage(normalizeError(error));
    } finally {
      setSendingCameraId("");
    }
  }

  return (
    <AdminShell
      activeItem="Monitoreo de Cámaras"
      eyebrow="Seguridad institucional"
      title="Monitoreo de Cámaras"
      actions={
        <button
          type="button"
          onClick={() => void loadReports()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar
        </button>
      }
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Cámaras activas</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{activeCount}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Cámaras inactivas</p>
            <CameraOff className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{inactiveCount}</p>
        </article>
        <article className="rounded-[1.75rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Bullying registrado</p>
            <ShieldAlert className="h-5 w-5 text-sky" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{detectedVideoCount}</p>
        </article>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cameraFeeds.map((camera) => (
          <article
            key={camera.id}
            className={`rounded-[1.75rem] border p-6 shadow-panel ${
              camera.active
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{camera.id}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{camera.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{camera.location}</p>
              </div>
              <Cctv className={`h-6 w-6 ${camera.active ? "text-emerald-600" : "text-rose-600"}`} />
            </div>

            <div className="mt-6 rounded-2xl bg-white/70 p-5">
              {camera.active && camera.videoUrl ? (
                <div className="overflow-hidden rounded-2xl bg-slate-900">
                  {camera.videoUrl.includes("youtube.com") ? (
                    <iframe
                      className="aspect-video w-full"
                      src={camera.videoUrl}
                      title={`Vista activa de ${camera.name}`}
                      loading="lazy"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      className="aspect-video w-full object-cover"
                      src={camera.videoUrl}
                      title={`Vista activa de ${camera.name}`}
                      autoPlay
                      muted
                      loop
                      controls
                      playsInline
                      preload="metadata"
                    />
                  )}
                </div>
              ) : (
                <div className="aspect-video rounded-2xl border border-dashed border-slate-300 bg-slate-900/90 p-4 text-white">
                  <div className="flex h-full flex-col justify-between">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-300">Vista activa</span>
                    <div>
                      <p className="text-lg font-semibold">{camera.active ? "Transmitiendo en vivo" : "Cámara sin señal"}</p>
                      <p className="mt-1 text-sm text-slate-300">{camera.lastSignal}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  camera.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {camera.active ? "Funcionando" : "No funcionando"}
              </span>
              {camera.childId && camera.videoName ? (
                <button
                  type="button"
                  onClick={() => void sendCameraAlert(camera)}
                  disabled={sendingCameraId !== ""}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {sendingCameraId === camera.id ? "Enviando alerta..." : "Enviar alerta push"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {successMessage ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <section className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-panel">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h3 className="text-lg font-bold text-slate-900">Reporte de aulas con bullying detectado</h3>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="py-3 pr-4">Fecha</th>
                <th className="py-3 pr-4">Aula</th>
                <th className="py-3 pr-4">Estudiante</th>
                <th className="py-3 pr-4">Video</th>
                <th className="py-3 pr-4">Confianza</th>
                <th className="py-3 pr-4">Alerta</th>
              </tr>
            </thead>
            <tbody>
              {reports.length > 0 ? (
                reports.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top">
                    <td className="py-4 pr-4">{formatDateTime(entry.created_at)}</td>
                    <td className="py-4 pr-4">{entry.metadata?.classroom || "Aula no definida"}</td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-slate-900">{entry.child?.nombre_completo}</p>
                      <p>{entry.child?.curso}</p>
                    </td>
                    <td className="py-4 pr-4">{entry.source_video_name}</td>
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
                    {loading ? "Cargando reportes..." : "No hay aulas con bullying detectado registrado."}
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

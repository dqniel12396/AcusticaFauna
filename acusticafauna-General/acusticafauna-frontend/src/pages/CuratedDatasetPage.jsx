import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "../components/shared/Badge";
import SectionCard from "../components/shared/SectionCard";
import {
  clearTemporaryCuratedSpectrograms,
  deleteCuratedSegmentSpectrogram,
  debugResolveAudio,
  fetchCuratedDatasetLabels,
  fetchCuratedDatasetStats,
  fetchCuratedSegmentDetail,
  fetchCuratedSegments,
  fetchCuratedSegmentSpectrogramBlob,
  getCuratedSegmentAudioUrl,
  importCuratedDataset,
  reviewCuratedSegment,
} from "../services/api";

const DEFAULT_DATASET_ROOT = "dataset_curado";

function formatSeconds(value) {
  const number = Number(value || 0);
  return `${number.toFixed(1)} s`;
}

function getGroupTone(groupType) {
  if (groupType === "positivo") return "success";
  if (groupType === "negativo_objetivo") return "warning";
  if (groupType === "otros_ruidos") return "info";
  if (groupType === "revisar") return "danger";
  return "default";
}

function getReviewTone(status) {
  if (status === "accepted") return "success";
  if (status === "corrected") return "info";
  if (status === "rejected") return "danger";
  if (status === "uncertain") return "warning";
  return "default";
}

function isConfirmedReview(status) {
  return status === "accepted" || status === "corrected";
}

function getSpectrogramStatusLabel(status) {
  if (status === "temporary_generated") return "Previsualizacion temporal";
  if (status === "confirmed_saved") return "Confirmado guardado";
  if (status === "error") return "Error al generar";
  return "Sin espectrograma";
}

function getSpectrogramModeLabel(mode) {
  return mode === "confirmed" ? "Espectrograma confirmado" : "Previsualizacion";
}

function getReviewDisplay(segment) {
  const status = segment.latest_review_status || segment.review_status;
  if (status === "accepted") {
    return { label: "Gold confirmado", description: "Aceptado por humano", tone: "success" };
  }
  if (status === "corrected") {
    return { label: "Gold corregido", description: "Corregido por humano", tone: "info" };
  }
  if (status === "uncertain") {
    return { label: "Pendiente real", description: "Marcado incierto", tone: "warning" };
  }
  if (status === "rejected") {
    return { label: "Excluido", description: "No usar para entrenamiento", tone: "danger" };
  }
  if (segment.is_real_pending || segment.source_label_status === "needs_audit") {
    return { label: "Requiere identificacion", description: "Pendiente real", tone: "danger" };
  }
  if (segment.training_status === "candidate_negative") {
    return { label: "Etiqueta importada", description: "Candidato negativo", tone: "warning" };
  }
  return { label: "Etiqueta importada", description: "Candidato para entrenamiento", tone: "default" };
}

function getTrainingStatusDisplay(status) {
  if (status === "gold") return { label: "Gold confirmado", tone: "success" };
  if (status === "candidate_negative") return { label: "Candidato negativo", tone: "warning" };
  if (status === "candidate") return { label: "Candidato", tone: "default" };
  if (status === "needs_review") return { label: "Requiere revision", tone: "danger" };
  if (status === "excluded") return { label: "Excluido", tone: "danger" };
  return { label: status || "Sin estado", tone: "default" };
}

function getTaxonomyName(segment) {
  return segment.taxonomy_scientific_name || segment.taxonomy_display_name || "";
}

function ToastStack({ messages, onDismiss }) {
  if (!messages.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-2xl border p-4 text-sm shadow-lg backdrop-blur ${
            message.type === "error"
              ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900 dark:bg-red-950/95 dark:text-red-200"
              : message.type === "warning"
                ? "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-900 dark:bg-amber-950/95 dark:text-amber-100"
              : message.type === "loading"
                ? "border-blue-200 bg-blue-50/95 text-blue-800 dark:border-blue-900 dark:bg-blue-950/95 dark:text-blue-200"
                : "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-200"
          }`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{message.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(message.id)}
              className="font-semibold opacity-70 hover:opacity-100"
              aria-label="Cerrar notificacion"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ config, onCancel, onConfirm }) {
  if (!config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{config.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{config.message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900"
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CuratedDatasetPage() {
  const [datasetRoot, setDatasetRoot] = useState(
    localStorage.getItem("acusticafauna_curated_root") || DEFAULT_DATASET_ROOT
  );
  const [stats, setStats] = useState(null);
  const [labels, setLabels] = useState([]);
  const [segments, setSegments] = useState({ items: [], total: 0, limit: 50, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [operationKey, setOperationKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [toasts, setToasts] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [spectrogramMode, setSpectrogramMode] = useState("preview");
  const [spectrogramUrl, setSpectrogramUrl] = useState("");
  const [spectrogramLoading, setSpectrogramLoading] = useState(false);
  const [spectrogramLoaded, setSpectrogramLoaded] = useState(false);
  const [spectrogramError, setSpectrogramError] = useState("");
  const [detailMessage, setDetailMessage] = useState("");
  const [audioErrors, setAudioErrors] = useState({});
  const [routeDiagnostic, setRouteDiagnostic] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const [labelFilter, setLabelFilter] = useState("");
  const [groupTypeFilter, setGroupTypeFilter] = useState("");
  const [negativeForFilter, setNegativeForFilter] = useState("");
  const [onlyReviewQueue, setOnlyReviewQueue] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [corrections, setCorrections] = useState({});
  const detailRef = useRef(null);
  const previousScrollYRef = useRef(0);

  const labelOptions = useMemo(
    () => labels.map((item) => item.label).filter(Boolean),
    [labels]
  );

  const negativeOptions = useMemo(() => {
    const values = stats?.by_negative_for || [];
    return values.map((item) => item.value).filter(Boolean);
  }, [stats]);

  function pushToast(text, type = "success") {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-3), { id, text, type }]);
    if (type !== "loading") {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4500);
    }
    return id;
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function copyText(text, message = "Copiado.") {
    navigator.clipboard?.writeText(text || "");
    pushToast(message);
  }

  function isBusy(key) {
    return operationKey === key;
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      const [statsData, labelsData, segmentsData] = await Promise.all([
        fetchCuratedDatasetStats(),
        fetchCuratedDatasetLabels(),
        fetchCuratedSegments({
          label: labelFilter,
          group_type: onlyReviewQueue ? "" : groupTypeFilter,
          negative_for: negativeForFilter,
          review_status: reviewStatusFilter,
          pending_real: onlyReviewQueue ? "true" : "",
          limit: 50,
          offset: 0,
        }),
      ]);
      setStats(statsData);
      setLabels(labelsData);
      setSegments(segmentsData);
    } catch (err) {
      setError(err.message || "No fue posible cargar el dataset curado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [labelFilter, groupTypeFilter, negativeForFilter, onlyReviewQueue, reviewStatusFilter]);

  useEffect(() => {
    return () => {
      if (spectrogramUrl) {
        URL.revokeObjectURL(spectrogramUrl);
      }
    };
  }, [spectrogramUrl]);

  async function handleImport() {
    try {
      setImporting(true);
      setError("");
      setSuccess("");
      localStorage.setItem("acusticafauna_curated_root", datasetRoot);

      const result = await importCuratedDataset({ dataset_root: datasetRoot });
      const message = `Importacion completa: ${result.imported_count} nuevos, ${result.skipped_duplicates} duplicados omitidos.`;
      setSuccess(message);
      pushToast(message);
      await loadAll();
    } catch (err) {
      setError(err.message || "No fue posible importar dataset_curado.");
      pushToast(err.message || "No fue posible importar dataset_curado.", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleReview(segment, reviewStatus, labelOverride = "") {
    const key = `review-${segment.id}`;
    if (operationKey) return;

    try {
      setOperationKey(key);
      setError("");
      setSuccess("");
      const correctedLabel = labelOverride || corrections[segment.id] || segment.label;
      const payload = {
        reviewed_label: reviewStatus === "corrected" ? correctedLabel : segment.label,
        review_status: reviewStatus,
        reviewer: "local",
        notes: "",
      };

      await reviewCuratedSegment(segment.id, payload);
      const reviewMessage =
        reviewStatus === "corrected" ? "Etiqueta corregida" : "Revision guardada";
      setSuccess(reviewMessage);
      setDetailMessage("Revision actualizada");
      pushToast(reviewMessage);
      setSpectrogramMode(isConfirmedReview(reviewStatus) ? "confirmed" : "preview");
      await loadAll();
      if (selectedDetail?.segment?.id === segment.id) {
        await openDetail(segment.id, isConfirmedReview(reviewStatus) ? "confirmed" : "preview", false);
      }
    } catch (err) {
      setError(err.message || "No fue posible guardar la revision.");
      setDetailMessage("No se pudo completar la accion.");
      pushToast(err.message || "No se pudo completar la accion.", "error");
    } finally {
      setOperationKey("");
    }
  }

  async function openDetail(segmentId, preferredMode = "preview", shouldScroll = true) {
    if (shouldScroll) {
      previousScrollYRef.current = window.scrollY;
    }
    try {
      setDetailLoading(true);
      setError("");
      const detail = await fetchCuratedSegmentDetail(segmentId);
      const latestReview = detail.reviews?.[0]?.review_status;
      const mode = preferredMode === "confirmed" || isConfirmedReview(latestReview) ? "confirmed" : "preview";
      setSelectedDetail(detail);
      setSpectrogramMode(mode);
      setSpectrogramLoaded(false);
      setSpectrogramUrl("");
      setSpectrogramError("");
      if (shouldScroll) {
        setDetailMessage("");
      }
      if (shouldScroll) {
        pushToast("Detalle abierto");
        window.setTimeout(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    } catch (err) {
      setError(err.message || "No fue posible cargar el detalle del segmento.");
      pushToast(err.message || "No fue posible cargar el detalle del segmento.", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
      setSelectedDetail(null);
      setSpectrogramMode("preview");
      setSpectrogramUrl("");
      setSpectrogramLoaded(false);
      setSpectrogramError("");
      setDetailMessage("");
      window.setTimeout(() => {
        window.scrollTo({ top: previousScrollYRef.current, behavior: "smooth" });
      }, 30);
  }

  async function diagnoseSegmentAudio(segment = selectedDetail?.segment, options = {}) {
    if (!segment?.id && !segment?.output_path) {
      setDetailMessage("No hay ruta de audio para diagnosticar.");
      return;
    }
    try {
      const result = segment.id
        ? await debugResolveAudio({ segment_id: segment.id, context: "curated_dataset" })
        : await debugResolveAudio(segment.output_path);
      setRouteDiagnostic(result);
      const allowed = result.allowed || result.audio_clean?.allowed || result.source_original?.allowed;
      const exists = result.exists || result.audio_clean?.exists || result.source_original?.exists;
      const status = allowed ? "Audio encontrado y permitido." : exists ? "El audio existe, pero esta fuera de las carpetas permitidas." : "Archivo no encontrado en dataset configurado.";
      const line = result.suggested_env_line ? ` Sugerencia .env: ${result.suggested_env_line}` : "";
      const message = `${status} ${result.matched_root ? `Root: ${result.matched_root}` : "Configura ACUSTICAFAUNA_DATASET_DIR o ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS."}${line}`;
      if (!options.quiet) setDetailMessage(message);
      setAudioErrors((current) => ({
        ...current,
        [segment.id || segment.output_path]: {
          message,
          reason: allowed ? "ok" : exists ? "ruta no autorizada" : "archivo no encontrado",
          suggested_env_line: result.suggested_env_line,
        },
      }));
      return result;
    } catch (err) {
      const message = err.message || "No fue posible diagnosticar la ruta de audio.";
      if (!options.quiet) setDetailMessage(message);
      setAudioErrors((current) => ({ ...current, [segment.id || segment.output_path]: { message, reason: "diagnostico fallo" } }));
      return null;
    }
  }

  async function handleCuratedAudioError(segment) {
    setAudioErrors((current) => ({
      ...current,
      [segment.id]: {
        message: "No se pudo abrir el audio porque la ruta no esta autorizada o no existe en este equipo.",
        reason: "error al cargar audio",
      },
    }));
    pushToast("Error al cargar audio. Puedes diagnosticar la ruta del segmento.", "error");
    await diagnoseSegmentAudio(segment, { quiet: true });
  }

  async function loadSpectrogram(mode = "preview", force = false) {
    const key = `spectrogram-${mode}-${selectedDetail?.segment?.id}`;
    if (!selectedDetail?.segment?.id || spectrogramLoading || operationKey) return;

    try {
      setOperationKey(key);
      setSpectrogramLoading(true);
      setSpectrogramError("");
      setSuccess("");

      const blob = await fetchCuratedSegmentSpectrogramBlob(
        selectedDetail.segment.id,
        mode,
        force
      );
      const nextUrl = URL.createObjectURL(blob);
      const updatedDetail = await fetchCuratedSegmentDetail(selectedDetail.segment.id);
      setSelectedDetail(updatedDetail);
      setSpectrogramUrl(nextUrl);
      setSpectrogramMode(mode);
      setSpectrogramLoaded(true);
      const message =
        mode === "confirmed"
          ? "Espectrograma confirmado guardado"
          : force
            ? "Previsualizacion regenerada"
            : "Previsualizacion generada";
      const localMessage =
        mode === "confirmed"
          ? "Guardado como espectrograma confirmado"
          : force
            ? "Previsualizacion regenerada correctamente"
            : "Previsualizacion generada correctamente";
      setSuccess(message);
      setDetailMessage(localMessage);
      pushToast(message);
    } catch (err) {
      setSpectrogramError(err.message || "No fue posible generar el espectrograma.");
      setDetailMessage("No se pudo completar la accion.");
      pushToast(err.message || "No se pudo completar la accion.", "error");
    } finally {
      setSpectrogramLoading(false);
      setOperationKey("");
    }
  }

  async function removeSpectrogram(mode = "preview") {
    if (!selectedDetail?.segment?.id) return;
    const key = `delete-spectrogram-${mode}-${selectedDetail.segment.id}`;
    if (operationKey) return;
    try {
      setOperationKey(key);
      setSpectrogramLoading(true);
      await deleteCuratedSegmentSpectrogram(selectedDetail.segment.id, mode);
      const message = mode === "preview" ? "Previsualizacion eliminada" : "Espectrograma confirmado eliminado";
      setSuccess(message);
      setDetailMessage(message);
      pushToast(message);
      setSpectrogramUrl("");
      setSpectrogramLoaded(false);
      await openDetail(selectedDetail.segment.id, "preview", false);
    } catch (err) {
      setError(err.message || "No fue posible eliminar el espectrograma.");
      setDetailMessage("No se pudo completar la accion.");
      pushToast(err.message || "No se pudo completar la accion.", "error");
    } finally {
      setSpectrogramLoading(false);
      setOperationKey("");
    }
  }

  function requestRemoveSpectrogram(mode = "preview") {
    setConfirmAction({
      title: mode === "preview" ? "Borrar previsualizacion" : "Borrar espectrograma confirmado",
      message:
        mode === "preview"
          ? "Esto eliminara solo la imagen temporal de previsualizacion de este segmento. No se borrara el audio ni la revision."
          : "Esto eliminara el espectrograma confirmado de este segmento. No se borrara el audio ni la revision.",
      confirmLabel: mode === "preview" ? "Borrar previsualizacion" : "Borrar confirmado",
      run: () => removeSpectrogram(mode),
    });
  }

  async function clearTmpPreviews() {
    if (operationKey) return;
    try {
      setOperationKey("clear-tmp");
      setSpectrogramLoading(true);
      const result = await clearTemporaryCuratedSpectrograms();
      const message = `Previsualizaciones eliminadas: ${result.deleted}.`;
      setSuccess(message);
      setDetailMessage("Previsualizaciones temporales limpiadas");
      pushToast(message);
      setSpectrogramUrl("");
      setSpectrogramLoaded(false);
      if (selectedDetail?.segment?.id) {
        await openDetail(selectedDetail.segment.id, "preview", false);
      }
    } catch (err) {
      setError(err.message || "No fue posible limpiar previsualizaciones temporales.");
      setDetailMessage("No se pudo completar la accion.");
      pushToast(err.message || "No se pudo completar la accion.", "error");
    } finally {
      setSpectrogramLoading(false);
      setOperationKey("");
    }
  }

  function requestClearTemporaryPreviews() {
    setConfirmAction({
      title: "Limpiar previsualizaciones",
      message:
        "Esto eliminara solo espectrogramas temporales usados para vista previa. No se borraran audios, revisiones ni espectrogramas confirmados.",
      confirmLabel: "Limpiar previsualizaciones",
      run: clearTmpPreviews,
    });
  }

  async function runConfirmedAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action?.run) {
      await action.run();
    }
  }

  function clearFilters() {
    setLabelFilter("");
    setGroupTypeFilter("");
    setNegativeForFilter("");
    setOnlyReviewQueue(false);
    setReviewStatusFilter("");
  }

  return (
    <div className="space-y-6 p-6 text-slate-800 dark:text-slate-100">
      <ToastStack messages={toasts} onDismiss={dismissToast} />
      <ConfirmDialog
        config={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
      <SectionCard
        title="Dataset Curado"
        subtitle="Catalogo local de segmentos limpios importados desde dataset_curado"
        rightContent={
          <button
            onClick={loadAll}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Recargar
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Carpeta dataset_curado
            </label>
            <input
              value={datasetRoot}
              onChange={(event) => setDatasetRoot(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleImport}
              disabled={importing}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {importing ? "Importando..." : "Importar manifest"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Los segmentos con etiqueta importada no necesitan aceptarse uno por uno.
          Revisa muestras, dudas o pendientes reales; usa la auditoria humana para confirmar
          casos utiles, corregir etiquetas o marcar incertidumbre.
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

      </SectionCard>

      <div className="grid gap-4 md:grid-cols-4">
        <SectionCard title="Segmentos" subtitle="Total importado">
          <p className="text-3xl font-bold text-slate-900">{stats?.total_segments || 0}</p>
        </SectionCard>
        <SectionCard title="Duracion" subtitle="Audio limpio">
          <p className="text-3xl font-bold text-slate-900">
            {formatSeconds(stats?.total_duration_seconds)}
          </p>
        </SectionCard>
        <SectionCard title="Revision" subtitle="Pendientes">
          <p className="text-3xl font-bold text-slate-900">{stats?.review_queue_count || 0}</p>
        </SectionCard>
        <SectionCard title="Etiquetas" subtitle="Taxonomia detectada">
          <p className="text-3xl font-bold text-slate-900">{labels.length}</p>
        </SectionCard>
      </div>

      <SectionCard
        title="Bandeja revisar_etiqueta"
        subtitle="Audios validos sin etiqueta confiable; revisar antes de usarlos en entrenamiento"
        rightContent={
          <button
            onClick={() => {
              setOnlyReviewQueue(true);
              setLabelFilter("");
              setGroupTypeFilter("");
              setNegativeForFilter("");
              setReviewStatusFilter("");
            }}
            className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Ver pendientes reales
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Pendientes por revisar</p>
            <p className="text-3xl font-bold text-slate-900">{stats?.review_queue_count || 0}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uso recomendado</p>
            <p className="mt-1 text-sm text-slate-700">
              Inspeccionar audio y espectrograma; confirmar como gold solo cuando la etiqueta sea confiable.
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Politica de espectrogramas</p>
            <p className="mt-1 text-sm text-slate-700">
              Previsualizacion temporal para revisar; guardar como confirmado solo en ejemplos gold.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Mantenimiento" subtitle="Acciones globales que no modifican audios ni revisiones">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Puedes borrar previsualizaciones temporales para liberar espacio. No se eliminan audios,
            revisiones ni espectrogramas confirmados.
          </p>
          <button
            onClick={requestClearTemporaryPreviews}
            disabled={Boolean(operationKey)}
            title="Borra imagenes temporales de espectrogramas. No afecta audios ni confirmados."
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Limpiar previsualizaciones
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Resumen" subtitle="Distribucion por tipo y etiquetas principales">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Por group_type</h3>
            <div className="space-y-2">
              {(stats?.by_group_type || []).map((item) => (
                <div key={item.value || "sin_valor"} className="flex justify-between text-sm">
                  <span>{item.value || "sin valor"}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Etiquetas principales</h3>
            <div className="space-y-2">
              {(stats?.by_label || []).slice(0, 10).map((item) => (
                <div key={item.value || "sin_valor"} className="flex justify-between text-sm">
                  <span>{item.value || "sin valor"}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Sample rates</h3>
            <div className="space-y-2">
              {(stats?.sample_rates || []).map((item) => (
                <div key={item.sample_rate} className="flex justify-between text-sm">
                  <span>{item.sample_rate} Hz</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Segmentos" subtitle="Inspeccion y revision rapida">
        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Label</label>
            <select
              value={labelFilter}
              onChange={(event) => setLabelFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas</option>
              {labelOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Group type</label>
            <select
              value={groupTypeFilter}
              onChange={(event) => setGroupTypeFilter(event.target.value)}
              disabled={onlyReviewQueue}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-100"
            >
              <option value="">Todos</option>
              <option value="positivo">positivo</option>
              <option value="negativo_objetivo">negativo_objetivo</option>
              <option value="otros_ruidos">otros_ruidos</option>
              <option value="revisar">revisar</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Negative for</label>
            <select
              value={negativeForFilter}
              onChange={(event) => setNegativeForFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todos</option>
              {negativeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Revision</label>
            <select
              value={reviewStatusFilter}
              onChange={(event) => setReviewStatusFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas</option>
              <option value="accepted">accepted</option>
              <option value="corrected">corrected</option>
              <option value="uncertain">uncertain</option>
              <option value="rejected">rejected</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyReviewQueue}
                onChange={(event) => setOnlyReviewQueue(event.target.checked)}
              />
              pendientes reales
            </label>
            <button
              onClick={clearFilters}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-sm text-slate-500">Cargando segmentos...</div>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Resultados: <strong className="text-slate-800">{segments.total}</strong>
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-3 font-medium">Audio</th>
                    <th className="px-3 py-3 font-medium">Label</th>
                    <th className="px-3 py-3 font-medium">Grupo</th>
                    <th className="px-3 py-3 font-medium">Negativo para</th>
                    <th className="px-3 py-3 font-medium">Duracion</th>
                    <th className="px-3 py-3 font-medium">Revision</th>
                    <th className="px-3 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.items.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-8 text-center text-slate-500">
                        No hay segmentos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    segments.items.map((segment) => (
                      <tr key={segment.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="min-w-80 px-3 py-4">
                          <audio
                            controls
                            preload="none"
                            src={getCuratedSegmentAudioUrl(segment.id)}
                            className="w-72"
                            onError={() => handleCuratedAudioError(segment)}
                          />
                          {audioErrors[segment.id] ? (
                            <div className="mt-2 space-y-2">
                              <Badge tone={audioErrors[segment.id].reason === "ruta no autorizada" ? "warning" : "danger"}>
                                {audioErrors[segment.id].reason}
                              </Badge>
                              <p className="max-w-80 text-xs text-red-700">{audioErrors[segment.id].message}</p>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => diagnoseSegmentAudio(segment)} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                                  Diagnosticar ruta
                                </button>
                                <button type="button" onClick={() => copyText(segment.output_path, "Ruta copiada.")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                                  Copiar ruta
                                </button>
                                {audioErrors[segment.id].suggested_env_line ? (
                                  <button type="button" onClick={() => copyText(audioErrors[segment.id].suggested_env_line, "Linea .env copiada.")} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                                    Copiar linea .env
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          <p className="mt-2 max-w-80 truncate font-mono text-xs text-slate-500">
                            {segment.source_filename || segment.segment_id}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <p className="font-semibold text-slate-800">{segment.label}</p>
                          {getTaxonomyName(segment) ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {getTaxonomyName(segment)}
                              {segment.taxonomy_group ? ` · ${segment.taxonomy_group}` : ""}
                            </p>
                          ) : null}
                          {segment.taxonomy_needs_review ? (
                            <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                              Taxonomia por revisar
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-4">
                          <Badge tone={getGroupTone(segment.group_type)}>{segment.group_type}</Badge>
                        </td>
                        <td className="px-3 py-4">{segment.negative_for || "-"}</td>
                        <td className="px-3 py-4">{formatSeconds(segment.duration_seconds)}</td>
                        <td className="px-3 py-4">
                          {(() => {
                            const display = getReviewDisplay(segment);
                            return (
                              <>
                                <Badge tone={display.tone}>{display.label}</Badge>
                                <p className="mt-1 text-xs text-slate-500">{display.description}</p>
                              </>
                            );
                          })()}
                          {segment.reviewed_label ? (
                            <p className="mt-1 text-xs text-slate-500">{segment.reviewed_label}</p>
                          ) : null}
                        </td>
                        <td className="min-w-80 px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => openDetail(segment.id)}
                              disabled={Boolean(operationKey)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {segment.is_real_pending ? "Identificar" : "Auditar"}
                            </button>
                            <button
                              onClick={() => handleReview(segment, "accepted")}
                              disabled={Boolean(operationKey)}
                              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {isBusy(`review-${segment.id}`) ? "Guardando..." : "Gold"}
                            </button>
                            <button
                              onClick={() => handleReview(segment, "uncertain")}
                              disabled={Boolean(operationKey)}
                              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                            >
                              Incierto
                            </button>
                            <button
                              onClick={() => handleReview(segment, "rejected")}
                              disabled={Boolean(operationKey)}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Excluir
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            No necesitas confirmar todos; audita muestras o casos dudosos.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <input
                              value={corrections[segment.id] || ""}
                              onChange={(event) =>
                                setCorrections((prev) => ({
                                  ...prev,
                                  [segment.id]: event.target.value,
                                }))
                              }
                              placeholder="Etiqueta corregida"
                              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={() => handleReview(segment, "corrected")}
                              disabled={Boolean(operationKey)}
                              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                            >
                              Corregir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {selectedDetail ? (
        <div ref={detailRef}>
        <SectionCard
          title="Detalle de segmento"
          subtitle="Audio, trazabilidad, espectrograma bajo demanda y revision humana"
          rightContent={
            <button
              onClick={closeDetail}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          }
        >
          {detailLoading ? (
            <div className="py-8 text-sm text-slate-500">Cargando detalle...</div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {getSpectrogramStatusLabel(selectedDetail.segment.spectrogram_status)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {getSpectrogramModeLabel(spectrogramMode)}
                    </p>
                  </div>
                  {spectrogramLoading ? (
                    <Badge tone="info">Generando...</Badge>
                  ) : spectrogramLoaded ? (
                    <Badge tone="success">{getSpectrogramModeLabel(spectrogramMode)} lista</Badge>
                  ) : (
                    <Badge>Sin imagen cargada</Badge>
                  )}
                </div>

                <div className="flex min-h-96 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                  {spectrogramUrl ? (
                    <img
                      src={spectrogramUrl}
                      alt={`Espectrograma de ${selectedDetail.segment.segment_id}`}
                      className="h-auto w-full bg-slate-950"
                      onLoad={() => setSpectrogramError("")}
                      onError={() =>
                        setSpectrogramError(
                          "No fue posible cargar el espectrograma. Revisa dependencias backend o permisos del archivo."
                        )
                      }
                    />
                  ) : (
                    <div className="px-6 py-12 text-center text-sm text-slate-300">
                      {spectrogramLoading
                        ? "Generando espectrograma..."
                        : "Genera una previsualizacion o abre un espectrograma confirmado desde los controles."}
                    </div>
                  )}
                </div>
                {spectrogramError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {spectrogramError}
                  </div>
                ) : null}

                <audio
                  controls
                  preload="metadata"
                  src={getCuratedSegmentAudioUrl(selectedDetail.segment.id)}
                  className="w-full"
                  onError={() => handleCuratedAudioError(selectedDetail.segment)}
                />
                {audioErrors[selectedDetail.segment.id] ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-semibold">No se pudo abrir el audio porque la ruta no esta autorizada o no existe en este equipo.</p>
                    <p className="mt-1">{audioErrors[selectedDetail.segment.id].message}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => diagnoseSegmentAudio(selectedDetail.segment)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                        Diagnosticar ruta
                      </button>
                      <button type="button" onClick={() => copyText(selectedDetail.segment.output_path, "Ruta copiada.")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
                        Copiar ruta
                      </button>
                      {audioErrors[selectedDetail.segment.id].suggested_env_line ? (
                        <button type="button" onClick={() => copyText(audioErrors[selectedDetail.segment.id].suggested_env_line, "Linea .env copiada.")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                          Copiar linea .env sugerida
                        </button>
                      ) : null}
                      <button type="button" onClick={() => window.location.assign("/configuracion")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
                        Ver configuracion de rutas
                      </button>
                    </div>
                  </div>
                ) : null}
                {routeDiagnostic ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
                    <p className="font-semibold">Diagnostico de ruta</p>
                    <div className="mt-2 grid gap-1">
                      <div><strong>Existe:</strong> {routeDiagnostic.exists ? "si" : "no"}</div>
                      <div><strong>Permitido:</strong> {routeDiagnostic.allowed ? "si" : "no"}</div>
                      <div><strong>Root coincidente:</strong> {routeDiagnostic.matched_root || "-"}</div>
                      <div><strong>Ruta final:</strong> <span className="break-all font-mono">{routeDiagnostic.resolved_final || routeDiagnostic.normalized_path || "-"}</span></div>
                      {routeDiagnostic.warning ? <div className="text-amber-800"><strong>Advertencia:</strong> {routeDiagnostic.warning}</div> : null}
                      {routeDiagnostic.suggested_env_line ? (
                        <div>
                          <strong>Linea .env sugerida:</strong>
                          <pre className="mt-1 overflow-auto rounded bg-blue-950 p-2 text-blue-50">{routeDiagnostic.suggested_env_line}</pre>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => loadSpectrogram("preview", false)}
                    disabled={spectrogramLoading || Boolean(operationKey)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {spectrogramLoading
                      ? "Generando..."
                      : selectedDetail.segment.spectrogram_status === "temporary_generated"
                        ? "Ver previsualizacion"
                        : "Generar previsualizacion"}
                  </button>
                  <button
                    onClick={() => loadSpectrogram("preview", true)}
                    disabled={spectrogramLoading || Boolean(operationKey)}
                    className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Regenerar previsualizacion
                  </button>
                  <button
                    onClick={() => loadSpectrogram("confirmed", false)}
                    disabled={
                      spectrogramLoading ||
                      Boolean(operationKey) ||
                      !isConfirmedReview(selectedDetail.reviews?.[0]?.review_status)
                    }
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Guardar como confirmado
                  </button>
                  <button
                    onClick={() => requestRemoveSpectrogram("preview")}
                    disabled={spectrogramLoading || Boolean(operationKey)}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Borrar previsualizacion
                  </button>
                  <button
                    onClick={() => requestRemoveSpectrogram("confirmed")}
                    disabled={spectrogramLoading || Boolean(operationKey)}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Borrar confirmado
                  </button>
                </div>
                {detailMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    {detailMessage}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">{selectedDetail.segment.label}</h3>
                  {getTaxonomyName(selectedDetail.segment) ? (
                    <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      {getTaxonomyName(selectedDetail.segment)}
                    </p>
                  ) : null}
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    {selectedDetail.segment.segment_id}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Grupo</span>
                      <Badge tone={getGroupTone(selectedDetail.segment.group_type)}>
                        {selectedDetail.segment.group_type}
                      </Badge>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Negativo para</span>
                      <strong>{selectedDetail.segment.negative_for || "-"}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Duracion</span>
                      <strong>{formatSeconds(selectedDetail.segment.duration_seconds)}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Sample rate</span>
                      <strong>{selectedDetail.segment.sample_rate || "-"} Hz</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Espectrograma</span>
                      <strong>{getSpectrogramStatusLabel(selectedDetail.segment.spectrogram_status)}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Etiqueta fuente</span>
                      <Badge tone={selectedDetail.segment.source_label_status === "needs_audit" ? "danger" : "default"}>
                        {selectedDetail.segment.source_label_status === "needs_audit"
                          ? "Requiere identificacion"
                          : "Importada"}
                      </Badge>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Estado dataset</span>
                      {(() => {
                        const display = getTrainingStatusDisplay(selectedDetail.segment.training_status);
                        return <Badge tone={display.tone}>{display.label}</Badge>;
                      })()}
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Grupo taxonomico</span>
                      <strong>{selectedDetail.segment.taxonomy_group || "-"}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Tipo taxonomico</span>
                      <strong>{selectedDetail.segment.taxonomy_label_type || "-"}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Uso taxonomico</span>
                      <Badge tone={selectedDetail.segment.taxonomy_use_for_training ? "success" : "warning"}>
                        {selectedDetail.segment.taxonomy_use_for_training ? "Entrenable" : "No entrenar"}
                      </Badge>
                    </div>
                  </div>
                  {selectedDetail.segment.taxonomy_needs_review ? (
                    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Esta etiqueta necesita revision taxonomica antes de usarla como referencia confiable.
                    </p>
                  ) : null}
                  <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {selectedDetail.segment.source_label_status === "needs_audit"
                      ? "Este segmento no tiene etiqueta confiable. Requiere identificacion antes de usarse en entrenamiento."
                      : "Este segmento ya tiene una etiqueta importada. No necesitas confirmarlo salvo que quieras auditarlo o convertirlo en ejemplo gold."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Auditoria humana</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedDetail.segment.source_label_status === "needs_audit"
                      ? "Identifica el sonido antes de usarlo como ejemplo de entrenamiento."
                      : "La etiqueta importada es un candidato. Confirma solo muestras utiles para gold, corrige dudas o excluye clips no confiables."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleReview(selectedDetail.segment, "accepted")}
                      disabled={Boolean(operationKey)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isBusy(`review-${selectedDetail.segment.id}`) ? "Guardando..." : "Confirmar como gold"}
                    </button>
                    <button
                      onClick={() => handleReview(selectedDetail.segment, "uncertain")}
                      disabled={Boolean(operationKey)}
                      className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      Marcar incierto
                    </button>
                    <button
                      onClick={() => handleReview(selectedDetail.segment, "rejected")}
                      disabled={Boolean(operationKey)}
                      className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={corrections[selectedDetail.segment.id] || ""}
                      onChange={(event) =>
                        setCorrections((prev) => ({
                          ...prev,
                          [selectedDetail.segment.id]: event.target.value,
                        }))
                      }
                      placeholder="Nueva etiqueta"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => handleReview(selectedDetail.segment, "corrected")}
                      disabled={Boolean(operationKey)}
                      className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      Corregir etiqueta
                    </button>
                  </div>
                  {detailMessage ? (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      {detailMessage}
                    </p>
                  ) : null}
                  {selectedDetail.segment.is_real_pending ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold text-slate-500">Etiquetas rapidas para pendientes reales</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "rana_sapo",
                          "ave",
                          "insecto",
                          "ruido_humano",
                          "otros_ruidos",
                          "desconocido_biologico",
                        ].map((label) => (
                          <button
                            key={label}
                            onClick={() => handleReview(selectedDetail.segment, "corrected", label)}
                            disabled={Boolean(operationKey)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Trazabilidad</h3>
                  <div className="mt-3 space-y-3 text-xs text-slate-600">
                    <p>
                      <span className="block font-semibold text-slate-800">Fuente original</span>
                      <span className="break-all font-mono">{selectedDetail.segment.source_path}</span>
                      <button type="button" onClick={() => copyText(selectedDetail.segment.source_path, "Ruta fuente copiada.")} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        Copiar fuente
                      </button>
                    </p>
                    <p>
                      <span className="block font-semibold text-slate-800">Audio limpio</span>
                      <span className="break-all font-mono">{selectedDetail.segment.output_path}</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => diagnoseSegmentAudio(selectedDetail.segment)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                          Diagnosticar ruta
                        </button>
                        <button type="button" onClick={() => copyText(selectedDetail.segment.output_path, "Ruta limpia copiada.")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                          Copiar audio limpio
                        </button>
                        {routeDiagnostic?.suggested_env_line ? (
                          <button type="button" onClick={() => copyText(routeDiagnostic.suggested_env_line, "Linea .env copiada.")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                            Copiar linea .env sugerida
                          </button>
                        ) : null}
                      </div>
                    </p>
                    <p>
                      <span className="block font-semibold text-slate-800">SHA256 fuente</span>
                      <span className="break-all font-mono">{selectedDetail.segment.source_sha256}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Revisiones</h3>
                  <div className="mt-3 space-y-3">
                    {selectedDetail.reviews?.length ? (
                      selectedDetail.reviews.slice(0, 1).map((review) => (
                        <div key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <Badge tone={getReviewTone(review.review_status)}>
                              {review.review_status}
                            </Badge>
                            <span className="text-xs text-slate-500">{review.updated_at}</span>
                          </div>
                          <p className="mt-2 font-semibold text-slate-800">{review.reviewed_label}</p>
                          {review.notes ? (
                            <p className="mt-1 text-slate-600">{review.notes}</p>
                          ) : null}
                          {selectedDetail.reviews.length > 1 ? (
                            <p className="mt-2 text-xs text-slate-500">
                              Hay {selectedDetail.reviews.length - 1} revision(es) anterior(es) ocultas.
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        Sin auditoria humana; se conserva la etiqueta importada como candidato.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

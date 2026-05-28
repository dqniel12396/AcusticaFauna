import { memo } from "react";
import Badge from "../components/shared/Badge";
import useRenderDebug from "../hooks/useRenderDebug";

function getAudioName(audioPath, fallback = "Audio") {
  if (!audioPath) return fallback;
  return String(audioPath).split(/[\\/]/).filter(Boolean).pop() || fallback;
}

function formatTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0:00";
  const minutes = Math.floor(number / 60);
  const seconds = Math.max(0, number - minutes * 60);
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function AudioLabResultRow({
  output,
  selected,
  statusLabel,
  statusTone,
  activeFolderBatchJobIsHistorical,
  activeFolderBatchJobFolderPath,
  onToggleSelection,
  onOpenAudio,
  onGenerateSpectrogram,
  onOpenQualityReport,
  onFeedback,
}) {
  useRenderDebug(`AudioLabResultRow:${output.id}`);

  return (
    <tr className="border-t border-slate-100">
      <td className="sticky left-0 bg-white px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelection(output.id)}
          aria-label={`Seleccionar ${getAudioName(output.original_audio_path)}`}
        />
      </td>
      <td className="px-3 py-2">
        <div className="max-w-56 truncate font-semibold" title={output.original_audio_path}>{getAudioName(output.original_audio_path)}</div>
        <div className="max-w-56 truncate text-xs text-slate-500" title={output.original_audio_path}>{output.original_audio_path}</div>
        {activeFolderBatchJobIsHistorical ? (
          <div className="max-w-56 truncate text-xs font-semibold text-amber-700" title={output.source_folder}>Job: {output.source_folder || activeFolderBatchJobFolderPath}</div>
        ) : null}
      </td>
      <td className="px-3 py-2"><Badge tone={statusTone}>{statusLabel}</Badge></td>
      <td className="px-3 py-2">{formatTime(output.start_seconds)} - {formatTime(output.end_seconds)}<div className="text-xs text-slate-500">{formatNumber(output.duration_seconds, 1)} s</div></td>
      <td className="px-3 py-2">{formatNumber(output.activity_score, 3)}</td>
      <td className="px-3 py-2">{formatNumber(output.band_energy_ratio, 3)}</td>
      <td className="px-3 py-2">{formatNumber(output.rms_dbfs, 1)}</td>
      <td className="px-3 py-2"><div className="max-w-48 truncate text-xs" title={output.contaminant_flags_json || ""}>{output.contaminant_flags_json || "[]"}</div></td>
      <td className="px-3 py-2"><Badge tone={output.recommendation === "candidate" ? "success" : output.recommendation === "error" ? "danger" : "warning"}>{output.recommendation || "review"}</Badge></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!output.output_audio_path} onClick={() => onOpenAudio(output.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Abrir audio</button>
          <button type="button" disabled={!output.output_audio_path} onClick={() => onGenerateSpectrogram(output.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Espectrograma</button>
          <button type="button" disabled={!output.quality_report_path} onClick={() => onOpenQualityReport(output.id)} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50">Reporte calidad</button>
          <button type="button" onClick={() => onFeedback(output.id, "confirmed_positive", "", "confirmed")} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-800">Confirmar</button>
          <button type="button" onClick={() => onFeedback(output.id, "excluded_from_training", "ruido", "excluded")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Excluir</button>
          <button type="button" onClick={() => onFeedback(output.id, "excluded_from_training", "voz_humana", "human_voice")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Voz humana</button>
          <button type="button" onClick={() => onFeedback(output.id, "excluded_from_training", "carro_motor", "car_motor")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Carro/motor</button>
          <button type="button" onClick={() => onFeedback(output.id, "excluded_from_training", "ave", "bird")} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Ave</button>
          <button type="button" onClick={() => onFeedback(output.id, "uncertain", "", "unsure")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Enviar a revisar</button>
        </div>
      </td>
    </tr>
  );
}

export default memo(AudioLabResultRow, (prev, next) => (
  prev.output === next.output &&
  prev.selected === next.selected &&
  prev.statusLabel === next.statusLabel &&
  prev.statusTone === next.statusTone &&
  prev.activeFolderBatchJobIsHistorical === next.activeFolderBatchJobIsHistorical &&
  prev.activeFolderBatchJobFolderPath === next.activeFolderBatchJobFolderPath &&
  prev.onToggleSelection === next.onToggleSelection &&
  prev.onOpenAudio === next.onOpenAudio &&
  prev.onGenerateSpectrogram === next.onGenerateSpectrogram &&
  prev.onOpenQualityReport === next.onOpenQualityReport &&
  prev.onFeedback === next.onFeedback
));

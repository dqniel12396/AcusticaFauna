import { memo, useMemo } from "react";
import useRenderDebug from "../hooks/useRenderDebug";
import { annotationStatusForOutput } from "./audioLabFolderBatchCalibration";
import AudioLabResultRow from "./AudioLabResultRow";

function AudioLabResultsTable({
  items,
  selectedIds,
  annotations,
  activeFolderBatchJobIsHistorical,
  activeFolderBatchJobFolderPath,
  onToggleSelection,
  onOpenAudio,
  onGenerateSpectrogram,
  onOpenQualityReport,
  onFeedback,
}) {
  useRenderDebug("AudioLabResultsTable");
  const annotationByOutput = useMemo(() => {
    const map = new Map();
    annotations.forEach((item) => {
      if (item.batch_output_id && item.status !== "retracted" && !map.has(item.batch_output_id)) {
        map.set(item.batch_output_id, item);
      }
    });
    return map;
  }, [annotations]);

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2">[ ]</th>
            <th className="px-3 py-2">Audio original</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Segmento</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Ratio banda</th>
            <th className="px-3 py-2">RMS dBFS</th>
            <th className="px-3 py-2">Flags</th>
            <th className="px-3 py-2">Recomendacion</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((output) => {
              const status = annotationStatusForOutput(output, annotationByOutput.has(output.id) ? [annotationByOutput.get(output.id)] : []);
              return (
                <AudioLabResultRow
                  key={output.id}
                  output={output}
                  selected={selectedIds.has(output.id)}
                  statusLabel={status.label}
                  statusTone={status.tone}
                  activeFolderBatchJobIsHistorical={activeFolderBatchJobIsHistorical}
                  activeFolderBatchJobFolderPath={activeFolderBatchJobFolderPath}
                  onToggleSelection={onToggleSelection}
                  onOpenAudio={onOpenAudio}
                  onGenerateSpectrogram={onGenerateSpectrogram}
                  onOpenQualityReport={onOpenQualityReport}
                  onFeedback={onFeedback}
                />
              );
            })
          ) : (
            <tr>
              <td colSpan="10" className="px-3 py-8 text-center text-slate-500">Sin resultados con estos filtros todavia.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default memo(AudioLabResultsTable);

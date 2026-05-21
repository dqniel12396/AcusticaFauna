# Calibracion acustica desde consola

Ejecutar desde:

```powershell
cd "F:\PROYECTO de cosa de sonido\acusticafauna-General\acusticafauna-Back"
```

Los scripts estan en:

```text
acusticafauna-General/acusticafauna-Back/scripts/
```

Listar configuraciones disponibles:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py --list-configs
```

Perfil acustico:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/analyze_audio_folder_profile.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 20 `
  --output "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_profile.json"
```

Prueba exploratoria amplia:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 3 `
  --configs exploratory_wide `
  --output-dir "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_exploratory"
```

Prueba intermedia:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 3 `
  --configs intermedia_exploratoria `
  --output-dir "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_intermedia"
```

Prueba mas cerrada:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 3 `
  --configs intermedia_cerrada `
  --output-dir "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_cerrada"
```

Prueba mas selectiva si `intermedia_cerrada` sigue demasiado amplia:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 3 `
  --configs intermedia_cerrada_mas_selectiva,intermedia_cerrada_mas_selectiva_ratio025 `
  --output-dir "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_selectiva"
```

Prueba estricta si la mas selectiva todavia puede incluir ruido:

```powershell
backend/.venv-backend/Scripts/python.exe scripts/test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 3 `
  --configs intermedia_cerrada_estricta `
  --output-dir "backend/storage/audio_lab/calibration_reports/pristimantis_simoterus_estricta"
```

Formato para `--configs-json` o `--configs-yaml`:

```json
{
  "configs": [
    {
      "name": "mi_config_custom",
      "label": "Mi config custom",
      "frequency_min_hz": 2000,
      "frequency_max_hz": 3300,
      "threshold_dbfs": -52,
      "min_band_energy_ratio": 0.2,
      "bandpass": true,
      "noise_reduce": false,
      "normalize": false
    }
  ]
}
```

Los audios originales no se modifican. Los previews y reportes se escriben en el `--output-dir`.

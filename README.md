# AcusticaFauna

AcusticaFauna es una app local-first para curar, revisar y experimentar con audios bioacusticos. Incluye backend FastAPI, frontend React/Vite y una ML API FastAPI aislada para inferencia y entrenamiento.

## Que incluye

- Laboratorio de audio para abrir, segmentar, limpiar, analizar y dejar feedback.
- Auditoria de feedback y Constructor de modelos ML.
- Explorador ML, registry de modelos y entrenamiento web.
- Procesamiento por lote, procesamiento masivo por carpeta local, reportes de calidad y recortes WAV trazables.

## Que no incluye el repo

- Audios reales grandes.
- `dataset_curado` completo.
- Outputs temporales, batch jobs o recortes generados.
- Modelos pesados dentro del Git normal.

Los datos y modelos se configuran localmente por `.env`, Releases/Git LFS o paquetes descargables.

El repo no incluye audios reales. Si ves `Error al cargar audio` en registros importados, configura `ACUSTICAFAUNA_DATASET_DIR` hacia tu dataset local, agrega una ruta segura en `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS` o usa uploads temporales en Laboratorio de audio.

## Estructura

```text
repo/
  acusticafauna-General/
    acusticafauna-Back/backend/
    acusticafauna-frontend/
    docs/
  acusticafauna-ML/
    ml_api/
    scripts/
    manifests/
    models/      # ignorado: descargar aparte
    outputs/     # ignorado
    ml_runs/     # ignorado
  scripts/
  sample_data/
```

## Instalacion rapida en Windows

Opcion recomendada para usuarios normales: PowerShell + HTTPS + Python 3.11.x.

| Tipo de usuario | Terminal | Clonado | Instalacion |
| --- | --- | --- | --- |
| Usuario normal Windows | PowerShell | HTTPS | `.\scripts\setup_windows.ps1` |
| Desarrollador avanzado | Git Bash opcional | SSH opcional | `bash scripts/setup_gitbash.sh` |

1. Instala Python 3.11.x:

   https://www.python.org/downloads/windows/

   En la pagina de descargas de Windows, busca una version Python 3.11.x. Sirve cualquier version de la rama 3.11: 3.11.0, 3.11.1, 3.11.8, 3.11.9, etc. Preferiblemente usa la mas reciente disponible dentro de Python 3.11.x.

   No uses el boton principal de descarga si te ofrece Python 3.13 o superior. Para AcusticaFauna ML se recomienda Python 3.11.x.

   Durante la instalacion marca `Add python.exe to PATH`.

   Cierra y abre PowerShell.

   Verifica:

   ```powershell
   py -3.11 --version
   ```

2. Instala Node.js LTS:

   https://nodejs.org/

   Verifica:

   ```powershell
   node --version
   npm.cmd --version
   ```

3. Clona con HTTPS, no SSH:

   ```powershell
   cd C:\
   git clone https://github.com/dqniel12396/AcusticaFauna.git AcusticaFauna
   cd C:\AcusticaFauna
   ```

   Usamos HTTPS porque no requiere configurar llaves SSH.

4. Ejecuta el diagnostico:

   ```powershell
   py -3.11 scripts\doctor_install.py
   ```

5. Crea carpetas locales:

   ```powershell
   py -3.11 scripts\create_local_dirs.py
   ```

6. Instala dependencias:

   ```powershell
   .\scripts\setup_windows.ps1
   ```

7. Arranca la aplicacion:

   ```powershell
   .\scripts\start_all.ps1
   ```

8. Abre:

   http://localhost:5173

### CORS en desarrollo local

`localhost` y `127.0.0.1` son orígenes distintos para el navegador. El backend permite por defecto:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`
- `http://127.0.0.1:5174`

Si usas otro puerto, agrega origins separados por comas en `.env`:

```env
CORS_ORIGINS=http://localhost:5175,http://127.0.0.1:5175
```

Recomendación práctica: abre siempre el frontend con la misma forma de host que uses durante la sesión. Si entras a `http://localhost:5173`, el backend debe permitir exactamente ese origin aunque la API esté en `http://127.0.0.1:8000`.

El comando `py -3.11` sirve para cualquier Python 3.11.x instalado. No exige que sea exactamente 3.11.0.

Python 3.13 no es recomendado para AcusticaFauna ML. Dependencias como `torch`, `opensoundscape`, `librosa`, `numba`, `llvmlite` y `soundfile` suelen ser mas estables con Python 3.11.x.

## Sirve cualquier Python 3.11?

Si. Sirve cualquier version 3.11.x. Lo importante es que el comando `py -3.11 --version` funcione. Recomendamos la ultima version disponible de la rama 3.11.x.

## Procesar carpetas grandes de audios

En `/laboratorio-audio` usa **Procesamiento masivo por carpeta local** cuando tengas decenas de GB de audios. Pega una ruta local, por ejemplo:

```text
C:\Datos\Ranas\lote_01
```

El backend escanea y procesa desde el mismo computador. No subas archivo por archivo desde el navegador.

El flujo:

1. Escanear carpeta.
2. Revisar cantidad de archivos, tamano y duracion estimada.
3. Elegir banda de frecuencia, por ejemplo `1800-3000 Hz`.
4. Ajustar threshold `dBFS` y ratio minimo de energia en banda.
5. Iniciar job.
6. Revisar candidatos, contaminantes y excluidos.
7. Exportar manifest CSV solo despues de revisar.

Reglas: no modifica audios originales, no borra datos, no entrena automaticamente y guarda outputs en `backend/storage/audio_lab/folder_batch_jobs/{job_id}/`.

## Limpieza de pruebas del Laboratorio

Los uploads temporales, outputs de batch y reportes de calidad son derivados guardados para trazabilidad. Si una corrida era solo prueba, usa **Laboratorio de audio -> Mantenimiento de laboratorio** para marcar jobs como prueba y limpiar derivados. Esta limpieza no borra audios originales ni toca `dataset_curado`.

## Rutas de audio permitidas

Por seguridad, el backend solo sirve audios desde carpetas permitidas. El frontend nunca debe usar una ruta local como `F:\...` o `C:\...` directamente como fuente del reproductor.

Variables utiles en `.env`:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PC202601\Descargasreal;D:\AudiosCampo
```

Usa `ACUSTICAFAUNA_DATASET_DIR` para Dataset Curado. Usa `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS` para carpetas adicionales de audios locales. No autorices una unidad completa como `F:\` salvo que realmente entiendas el alcance.

## Importacion local

Importacion local sirve para importar resultados externos ya generados: salidas de BirdNET, CSV de resumen, `selection.table.txt`, espectrogramas o sesiones externas con eventos/predicciones.

No es el flujo para limpiar audios, segmentar por frecuencia, reducir ruido ni procesar 70 GB. Para eso usa **Laboratorio de audio -> Procesamiento masivo por carpeta local**.

## Si no tienes Git instalado

Puedes descargar el ZIP desde GitHub:

1. Abre el repositorio en GitHub.
2. Pulsa `Code`.
3. Pulsa `Download ZIP`.
4. Descomprime en:

```text
C:\AcusticaFauna
```

Entra con PowerShell:

```powershell
cd C:\AcusticaFauna
py -3.11 scripts\doctor_install.py
py -3.11 scripts\create_local_dirs.py
.\scripts\setup_windows.ps1
```

## Git Bash y SSH son opcionales

Git Bash no es obligatorio. SSH no es obligatorio.

Para la mayoria de usuarios se recomienda HTTPS:

```powershell
git clone https://github.com/dqniel12396/AcusticaFauna.git
```

SSH solo es para desarrolladores que ya tienen llaves configuradas:

```bash
git clone git@github.com:dqniel12396/AcusticaFauna.git
```

## Error comun: npm.ps1 Statement

Si en PowerShell aparece un error parecido a:

```text
No se encuentra la propiedad 'Statement' en C:\Program Files\nodejs\npm.ps1
```

No es un error de AcusticaFauna. Es PowerShell ejecutando `npm.ps1` en vez de `npm.cmd`.

Los scripts de AcusticaFauna ya usan `npm.cmd` automaticamente. Si ejecutas comandos manualmente, usa:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

## Error: No suitable Python runtime found

Este error no significa que falte cualquier Python. Significa que no esta instalado Python 3.11.x o que no esta registrado en el Python Launcher.

Solucion:

1. Instala Python 3.11.x desde https://www.python.org/downloads/windows/
2. En la pagina de Windows busca una version 3.11.x y descarga `Windows installer (64-bit)`.
3. Durante la instalacion marca `Add python.exe to PATH`.
4. Cierra y abre PowerShell.
5. Verifica:

```powershell
py -3.11 --version
```

## Error: audio_path_not_allowed

Si ves `audio_path_not_allowed`, el archivo existe pero esta fuera de las carpetas que el backend puede servir.

Solucion:

1. Si es Dataset Curado, configura `ACUSTICAFAUNA_DATASET_DIR` con la carpeta real del dataset.
2. Si es una carpeta externa de audios, agrega solo esa carpeta a `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`.
3. Reinicia backend/frontend.
4. En la app abre Configuracion -> Rutas de audio permitidas y pulsa `Probar rutas`.

Si clonaste el repo en otro PC, recuerda que los audios reales no vienen con GitHub.

### Dataset Curado: Error al cargar audio

Si Dataset Curado muestra `Error al cargar audio`, revisa que `ACUSTICAFAUNA_DATASET_DIR` apunte al dataset real, no a una carpeta vacia del clon:

```env
ACUSTICAFAUNA_DATASET_DIR=F:\PROYECTO de cosa de sonido\dataset_curado
ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS=F:\PROYECTO de cosa de sonido\dataset_ranas-20260512T141405Z-3-004
```

En la pantalla de Dataset Curado usa `Diagnosticar ruta` para copiar la linea `.env` sugerida.

### Errores content-script en consola

Mensajes como `content-script.bundle.js: i.startsWith is not a function` suelen venir de extensiones del navegador. Si la app carga y los endpoints responden, no los trates como error de AcusticaFauna.

## Arranque rapido

En tres terminales:

```powershell
.\scripts\start_backend.ps1
.\scripts\start_ml_api.ps1
.\scripts\start_frontend.ps1
```

O todo junto:

```powershell
.\scripts\start_all.ps1
```

Abre `http://localhost:5173`.

## Configuracion

Copia `.env.example` a `.env` y ajusta rutas si hace falta.

Variables clave:

- `ACUSTICAFAUNA_DATASET_DIR`
- `ACUSTICAFAUNA_STORAGE_DIR`
- `ACUSTICAFAUNA_MODELS_DIR`
- `ACUSTICAFAUNA_MANIFESTS_DIR`
- `ACUSTICAFAUNA_ALLOWED_AUDIO_ROOTS`
- `ACUSTICAFAUNA_RESOURCE_PROFILE`

Si no tienes dataset, puedes usar uploads temporales en Laboratorio de audio.

## Modelos

Lista paquetes:

```bash
python scripts/download_models.py --list
```

Descarga pack default cuando existan URLs de release:

```bash
python scripts/download_models.py --pack default
```

Si un modelo falta, la ML API lo reporta como `modelo no descargado` y no rompe `/models`.

## Diagnostico

```bash
python scripts/doctor_install.py
python scripts/check_environment.py
python scripts/preflight_github.py
```

## Barrido avanzado en la web

El flujo principal esta en **Laboratorio de audio -> Asistente de calibracion acustica**. Pega la carpeta local, escribe el label, usa una muestra de 30 o 50 audios, elige **Tipo de barrido** y pulsa **Crear barrido avanzado**. No necesitas JSON manuales ni consola.

Usa **Adaptativo general** para aves, insectos y otras ranas: el backend analiza el perfil acustico de la carpeta, toma las bandas con mayor contraste y recalcula las frecuencias del barrido. No reutiliza rangos de `Pristimantis_simoterus`.

Usa **Pristimantis simoterus lluvia/viento** solo para ese caso. Estos rangos son un preset especifico, no universal:

- **Alta confianza**: `2300-3300 Hz`, threshold `-50 dBFS`, ratio `0.27`, `noise_reduce=false`, `normalize=false`. Usala cuando prefieras pocos candidatos y menor riesgo de falsos positivos.
- **Equilibrada recomendada**: `2200-3200 Hz`, threshold `-50 dBFS`, ratio `0.25`, `noise_reduce=false`, `normalize=false`. Usala como primera opcion para revision humana si no hay dano, clipping ni exceso de candidatos.
- **Mayor cobertura**: `2200-3300 Hz`, threshold `-51 dBFS`, ratio `0.23`, `noise_reduce=false`, `normalize=false`. Usala cuando Alta confianza o Equilibrada dejan pocos candidatos; requiere mas revision.
- **Exploratoria**: `2000-3500 Hz`, threshold `-52 dBFS`, ratio `0.20`, `noise_reduce=false`, `normalize=false`. Solo exploracion / no entrenamiento automatico.

El boton **Aplicar al procesamiento masivo** copia ruta, label y parametros exactos al formulario masivo con preset personalizado. No inicia procesamiento automaticamente: escanea la carpeta y ejecuta un nuevo job despues de revisar previews. Los audios originales no se modifican.

Si aparece `Extension context invalidated`, viene de una extension del navegador. Prueba modo incognito o desactiva extensiones; no es un error de AcusticaFauna.

## Barrido CLI de calibracion

Los scripts CLI se mantienen para depuracion avanzada. Para uso normal, prefiere el barrido avanzado disponible en la web:

```powershell
cd acusticafauna-General\acusticafauna-Back
python scripts\test_audio_processing_configs.py `
  --folder "F:\PROYECTO de cosa de sonido\prueba de Pristimantis simoterus" `
  --label Pristimantis_simoterus `
  --sample-size 10 `
  --configs-json scripts\calibration_configs\pristimantis_debug_sweep.json `
  --output-dir backend\storage\audio_lab\calibration_reports\pristimantis_debug_sweep
```

El script genera `summary.json`, `summary.csv` y `report.md`, e imprime por consola config, candidatos, duracion, ratio, posible dano, clipping y recomendacion. Los audios originales no se modifican.

## Documentacion

- [Instalacion local](docs/INSTALACION_LOCAL.md)
- [Modelos y datos](acusticafauna-General/docs/MODELOS_Y_DATOS.md)
- [Estructura del proyecto](acusticafauna-General/docs/ESTRUCTURA_PROYECTO.md)
- [Recursos hardware](acusticafauna-General/docs/RECURSOS_HARDWARE.md)
- [Guia tecnica ML](acusticafauna-General/docs/GUIA_TECNICA_ML_ACUSTICAFAUNA.md)

## Reglas importantes

- No modificar audios originales.
- No modificar `dataset_curado` directamente.
- No entrenar automaticamente sin dry-run.
- Mantener OpenSoundscape aislado en `acusticafauna-ML`.

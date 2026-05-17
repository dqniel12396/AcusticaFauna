# Recursos hardware

AcusticaFauna puede ejecutar procesamiento DSP, inferencia ML y entrenamiento. Para no saturar un PC local, usa perfiles de recursos.

## Perfiles

- `auto`: detecta CPU/RAM/GPU y recomienda un perfil conservador.
- `eco`: usa menos threads/workers, batch pequeno y prefiere CPU.
- `balanceado`: deja recursos libres, usa CUDA si esta disponible.
- `rendimiento`: puede usar mas CPU/GPU; requiere cuidado.

## Variables

```text
ACUSTICAFAUNA_RESOURCE_PROFILE=auto
ACUSTICAFAUNA_MAX_CPU_THREADS=auto
ACUSTICAFAUNA_MAX_WORKERS=auto
ACUSTICAFAUNA_DEVICE=auto
```

## Endpoints

- Backend: `GET /api/system/hardware-profile`
- ML API: `GET /system/hardware-profile`

## Limites de threads

La ML API aplica limites para:

- `OMP_NUM_THREADS`
- `MKL_NUM_THREADS`
- `NUMEXPR_NUM_THREADS`
- `torch.set_num_threads` si torch esta disponible

## Recomendacion

Usa `eco` en portatiles o PCs con poca RAM. Usa `balanceado` por defecto. Usa `rendimiento` solo si quieres aprovechar GPU/CPU y aceptas consumo alto.

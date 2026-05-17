from __future__ import annotations

from paths import LOCAL_DIRS


def create_local_dirs() -> list[str]:
    created = []
    for path in LOCAL_DIRS:
        existed = path.exists()
        path.mkdir(parents=True, exist_ok=True)
        if not existed:
            created.append(str(path))
    return created


def main() -> None:
    created = create_local_dirs()
    if created:
        print("Carpetas creadas:")
        for path in created:
            print(f"  OK {path}")
    else:
        print("OK: todas las carpetas locales ya existian.")


if __name__ == "__main__":
    main()

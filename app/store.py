from __future__ import annotations

import json
from pathlib import Path


class CatalogStore:
    def __init__(self, catalog_path: Path) -> None:
        self.catalog_path = catalog_path
        self._cache: list[dict] = []
        self.reload()

    def reload(self) -> None:
        self._cache = json.loads(self.catalog_path.read_text())

    def trending(self) -> list[dict]:
        return sorted(self._cache, key=lambda item: item.get("rating", 0), reverse=True)

    def search(self, query: str) -> list[dict]:
        needle = query.lower().strip()
        if not needle:
            return []
        return [
            item
            for item in self._cache
            if needle in item["title"].lower() or any(needle in g.lower() for g in item.get("genres", []))
        ]

    def by_id(self, title_id: str) -> dict | None:
        for item in self._cache:
            if item["id"] == title_id:
                return item
        return None

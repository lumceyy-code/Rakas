from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass
class ProviderResult:
    provider: str
    url: str
    quality: list[str]


class ProviderResolver:
    """Simple fallback resolver for stream links."""

    def __init__(self, provider_health: dict[str, bool] | None = None) -> None:
        self.provider_health = provider_health or {"alpha": True, "beta": True, "gamma": True}

    def resolve(self, stream_candidates: Iterable[dict]) -> ProviderResult | None:
        for candidate in stream_candidates:
            provider = candidate.get("provider", "unknown")
            if self.provider_health.get(provider, False):
                return ProviderResult(
                    provider=provider,
                    url=candidate["url"],
                    quality=candidate.get("quality", []),
                )
        return None

"""Guideline knowledge base and BM25 retrieval.

Retrieval is deliberately simple and deterministic: every recommendation the
agent makes must cite one of these guideline chunks, so the knowledge base is
the single source of clinical truth (not the LLM's own memory).
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent
LEVELS = ("self_care", "routine", "urgent", "emergency")
LEVEL_RANK = {level: i for i, level in enumerate(LEVELS)}

_TOKEN = re.compile(r"[a-z0-9']+")
_STOP = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "is", "it", "i", "my", "me", "have",
    "has", "had", "with", "for", "at", "be", "been", "this", "that", "since", "from", "am", "are",
    "was", "were", "so", "but", "very", "really", "feel", "feeling", "got", "get", "some", "her",
    "his", "she", "he", "they", "we", "our", "your", "you", "its", "also", "just", "days", "day",
    "myself", "himself", "herself", "not", "off", "weird", "like", "think", "bit", "little", "after", "when",
}


NEGATION = re.compile(r"\b(no|not|without|denies|never had)\s+(a\s+|any\s+)?[a-z]+", re.IGNORECASE)


def strip_negations(text: str) -> str:
    """Remove simple negated findings ("no fever") so they don't drive retrieval."""
    return NEGATION.sub(" ", text)


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


@dataclass(frozen=True)
class Guideline:
    id: str
    category: str
    title: str
    level: str
    source: str
    url: str
    keywords: tuple[str, ...]
    text: str

    def citation(self) -> dict:
        return {"guideline_id": self.id, "title": self.title, "source": self.source, "url": self.url}


@dataclass(frozen=True)
class Hit:
    guideline: Guideline
    score: float


@lru_cache(maxsize=1)
def load_guidelines() -> tuple[Guideline, ...]:
    raw = json.loads((DATA_DIR / "guidelines.json").read_text())
    return tuple(Guideline(**{**g, "keywords": tuple(g["keywords"])}) for g in raw)


@lru_cache(maxsize=1)
def load_providers() -> tuple[dict, ...]:
    return tuple(json.loads((DATA_DIR / "providers.json").read_text()))


def guideline_by_id(gid: str) -> Guideline | None:
    return next((g for g in load_guidelines() if g.id == gid), None)


class BM25Index:
    def __init__(self, docs: tuple[Guideline, ...], k1: float = 1.4, b: float = 0.75):
        self.docs = docs
        self.k1, self.b = k1, b
        # Keywords are weighted twice: they are the curated retrieval signal.
        self.tokens = [
            tokenize(f"{d.title} {d.category} {' '.join(d.keywords)} {' '.join(d.keywords)} {d.text}")
            for d in docs
        ]
        self.avgdl = sum(len(t) for t in self.tokens) / max(len(self.tokens), 1)
        df: dict[str, int] = {}
        for toks in self.tokens:
            for term in set(toks):
                df[term] = df.get(term, 0) + 1
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, k: int = 5) -> list[Hit]:
        query = strip_negations(query)
        q = tokenize(query)
        lowered = query.lower()
        scored: list[Hit] = []
        for doc, toks in zip(self.docs, self.tokens, strict=False):
            tf: dict[str, int] = {}
            for t in toks:
                tf[t] = tf.get(t, 0) + 1
            score = 0.0
            for term in q:
                if term not in tf:
                    continue
                f = tf[term]
                denom = f + self.k1 * (1 - self.b + self.b * len(toks) / self.avgdl)
                score += self.idf.get(term, 0.0) * f * (self.k1 + 1) / denom
            # Exact multi-word keyword phrase bonus.
            score += sum(3.0 for kw in doc.keywords if " " in kw and kw in lowered)
            if score > 0:
                scored.append(Hit(doc, round(score, 3)))
        scored.sort(key=lambda h: h.score, reverse=True)
        return scored[:k]


@lru_cache(maxsize=1)
def get_index() -> BM25Index:
    return BM25Index(load_guidelines())


def retrieve(query: str, k: int = 5) -> list[Hit]:
    return get_index().search(query, k)

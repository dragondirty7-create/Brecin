"""Deterministic control shell around an AI browser agent.

Model suggestions are untrusted. This module makes the allow/review/deny
choice *before* the agent is permitted to interact with a browser.
No network, credentials, paid APIs or persistence are used by this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import re
import threading
import time
from typing import Callable, Protocol
from urllib.parse import urlsplit


class Outcome(str, Enum):
    COMPLETED = "completed"
    NEEDS_HUMAN = "needs_human"
    BLOCKED = "blocked"
    BUDGET_EXCEEDED = "budget_exceeded"
    FAILED = "failed"


@dataclass(frozen=True)
class Task:
    task_id: str
    goal: str
    start_url: str
    allowed_hosts: tuple[str, ...]
    success_contains: tuple[str, ...]
    max_actions: int = 20
    max_decisions: int = 30
    max_seconds: float = 60.0
    max_estimated_usd: float = 0.10
    estimated_usd_per_decision: float = 0.002
    max_stale_retries: int = 2

    def __post_init__(self) -> None:
        if not self.task_id or not self.goal.strip():
            raise ValueError("Task needs an ID and goal")
        if not self.allowed_hosts or not self.success_contains:
            raise ValueError("Tasks require explicit allowed hosts and success evidence")
        if any(not s.strip() for s in self.success_contains):
            raise ValueError("Success checks cannot be empty")
        if any(n <= 0 for n in (self.max_actions, self.max_decisions, self.max_seconds)):
            raise ValueError("Time and action limits must be positive")
        if self.max_estimated_usd <= 0 or self.estimated_usd_per_decision <= 0:
            raise ValueError("Estimated-cost limits must be positive")
        if self.max_stale_retries < 0:
            raise ValueError("Negative stale retries are invalid")
        hosts = tuple(h.lower() for h in self.allowed_hosts)
        if hosts != self.allowed_hosts or any(not h or "/" in h or ":" in h for h in hosts):
            raise ValueError("Allowlisted hosts must be lowercase hostnames without ports")
        if not self.in_scope(self.start_url):
            raise ValueError("Starting page outside explicitly allowed hosts")

    def in_scope(self, url: str) -> bool:
        p = urlsplit(url)
        return p.scheme == "https" and (p.hostname or "").lower() in self.allowed_hosts

    @property
    def dedupe_key(self) -> str:
        # No raw task text is persisted as a shared key.
        payload = f"{self.start_url}\0{self.goal.casefold().strip()}\0{self.allowed_hosts}\0{self.success_contains}".encode()
        return hashlib.sha256(payload).hexdigest()[:24]


@dataclass(frozen=True)
class Action:
    key: str
    kind: str
    label: str
    # IDs are opaque indexes from the observed page, never generated selectors.


@dataclass(frozen=True)
class Observation:
    url: str
    text: str
    fingerprint: str


@dataclass(frozen=True)
class Decision:
    action: Action | None
    confidence: float
    terminal: str | None = None  # "done" / "blocked"


class BrowserWorker(Protocol):
    def observe(self) -> Observation: ...
    def decide(self) -> Decision: ...
    def execute(self, decision: Decision) -> Observation: ...
    def close(self) -> None: ...


@dataclass(frozen=True)
class GateResult:
    verdict: str  # allow, review, deny
    why: str


class Policy:
    """Conservative read-only defaults; unclear clicks require review.

    All event-producing controls can affect account state. A descriptive label
    is not a proof of safety: default is review, never implicit execution.
    For the pilot, only visible navigation/filter/search operations are allowed.
    """

    _sensitive = re.compile(
        r"password|passcode|\botp\b|2fa|secret|api.?key|token|credit.?card|"
        r"bank|payment|billing|security.?code|social.?security|ssn|"
        r"delete|erase|remove|cancel|unsubscribe|publish|deploy|"
        r"send|reply|message|contact|apply|purchase|buy|checkout|"
        r"order|submit|sign.?in|log.?in|register|invite|share|permission|"
        r"admin|transfer|wire|withdraw|donate|refund|terminate|"
        r"confirm|accept|save|update|create|upload|download",
        re.IGNORECASE,
    )
    _safe_nav = re.compile(
        r"^(search|find|view|show|read|next(?: page)?|previous(?: page)?|"
        r"back|open (?:results|article|listing|details)|more results|"
        r"filter|sort|expand results|results|details|browse)\b",
        re.IGNORECASE,
    )
    _safe_fill = re.compile(
        r"\b(search|query|keyword|origin|destination|where from|where to|"
        r"departure|arrival|date|check.?in|check.?out|city|location)\b",
        re.IGNORECASE,
    )

    def gate(self, task: Task, page: Observation, proposed: Decision) -> GateResult:
        if not task.in_scope(page.url):
            return GateResult("review", "Browser left explicitly authorized domain")
        if proposed.terminal:
            return GateResult("allow", "Terminal decision requires independent verification")
        a = proposed.action
        if a is None:
            return GateResult("deny", "Missing observed action")
        if a.kind in {"wait", "scroll_up", "scroll_down"}:
            return GateResult("allow", "Passive browser action")
        if self._sensitive.search(a.label):
            return GateResult("review", "Potentially consequential or sensitive control")
        if a.kind == "fill":
            if self._safe_fill.search(a.label):
                return GateResult("allow", "Read-only search/filter field")
            return GateResult("review", "Unclassified input field")
        if a.kind == "select":
            # Even a select widget can submit or change an account setting.
            return GateResult("review", "Dropdown side effect unverified")
        if a.kind == "click" and self._safe_nav.search(a.label):
            return GateResult("allow", "Read-only navigation/search label")
        return GateResult("review", "Unknown click or unsupported operation")


@dataclass
class RunReport:
    task_id: str
    outcome: Outcome
    reason: str
    decisions: int = 0
    actions: int = 0
    estimated_usd: float = 0.0
    elapsed_seconds: float = 0.0
    verified: bool = False
    audit: list[dict[str, str | int | float]] = field(default_factory=list)


@dataclass
class _Trail:
    # A trail is earned only by an independently verified successful run.
    score: float
    evidence_count: int
    last_seen: float


class TrailStore:
    """Ant-style stigmergy: verified outcomes leave bounded, decaying hints.

    Hints never bypass the policy gate or approve browser actions. Trails are
    ephemeral by default; nothing is exported or stored with private page text.
    """

    def __init__(self, half_life_seconds: float = 3600.0):
        if half_life_seconds <= 0:
            raise ValueError("Positive half-life required")
        self.half_life_seconds = half_life_seconds
        self._trails: dict[str, _Trail] = {}
        self._lock = threading.Lock()

    @staticmethod
    def key(task: Task, action: Action) -> str:
        raw = f"{task.dedupe_key}:{action.kind}:{action.label.casefold()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:28]

    def leave_success(self, task: Task, actions: list[Action], verified: bool, at: float | None = None) -> None:
        if not verified:
            return
        now = time.time() if at is None else at
        with self._lock:
            for action in actions:
                k = self.key(task, action)
                trail = self._trails.get(k)
                score = self._decay(trail, now) if trail else 0.0
                self._trails[k] = _Trail(min(5.0, score + 1.0), (trail.evidence_count + 1) if trail else 1, now)

    def hint(self, task: Task, action: Action, at: float | None = None) -> float:
        now = time.time() if at is None else at
        with self._lock:
            trail = self._trails.get(self.key(task, action))
            return round(self._decay(trail, now), 5) if trail else 0.0

    def _decay(self, trail: _Trail, now: float) -> float:
        return trail.score * (0.5 ** (max(0, now - trail.last_seen) / self.half_life_seconds))


class StaleDecision(RuntimeError):
    """The page changed before input; a proposal may be discarded safely."""


class AmbiguousExecution(RuntimeError):
    """A side effect might have occurred; NEVER blindly retry."""


class Colony:
    def __init__(self, *, policy: Policy | None = None, trails: TrailStore | None = None):
        self.policy = policy or Policy()
        self.trails = trails or TrailStore()
        self._completed_keys: set[str] = set()
        self._running_keys: set[str] = set()
        self._lock = threading.Lock()

    def run(self, task: Task, worker: BrowserWorker) -> RunReport:
        start = time.monotonic()
        observed: list[Action] = []
        r = RunReport(task_id=task.task_id, outcome=Outcome.FAILED, reason="Not started")

        def finish(status: Outcome, reason: str, verified: bool = False) -> RunReport:
            r.outcome = status
            r.reason = reason
            r.verified = verified
            r.elapsed_seconds = round(time.monotonic() - start, 5)
            if verified:
                self.trails.leave_success(task, observed, True)
                with self._lock:
                    self._completed_keys.add(task.dedupe_key)
            return r

        reserved = False
        try:
            with self._lock:
                if task.dedupe_key in self._completed_keys or task.dedupe_key in self._running_keys:
                    return finish(Outcome.BLOCKED, "Duplicate of an active or verified task")
                self._running_keys.add(task.dedupe_key)
                reserved = True
            page = worker.observe()
            stale_retries = 0
            while True:
                if not task.in_scope(page.url):
                    return finish(Outcome.NEEDS_HUMAN, "Browser reached an unapproved host")
                if time.monotonic() - start >= task.max_seconds:
                    return finish(Outcome.BUDGET_EXCEEDED, "Time budget reached")
                if r.decisions >= task.max_decisions or r.actions >= task.max_actions:
                    return finish(Outcome.BUDGET_EXCEEDED, "Action or decision budget reached")
                if r.estimated_usd + task.estimated_usd_per_decision > task.max_estimated_usd + 1e-12:
                    return finish(Outcome.BUDGET_EXCEEDED, "Estimated model budget reached")
                r.decisions += 1
                r.estimated_usd = round(r.decisions * task.estimated_usd_per_decision, 8)
                decision = worker.decide()
                # Jev may re-observe a navigating page while deciding. Always gate
                # the *current* page, not the snapshot from the previous action.
                page = worker.observe()
                if not task.in_scope(page.url):
                    return finish(Outcome.NEEDS_HUMAN, "Page changed to an unauthorized host during prediction")
                result = self.policy.gate(task, page, decision)
                if result.verdict != "allow":
                    r.audit.append({"type": "gate", "verdict": result.verdict, "reason": result.why})
                    return finish(Outcome.NEEDS_HUMAN if result.verdict == "review" else Outcome.BLOCKED, result.why)
                if decision.terminal == "done":
                    # Independent verification, not the agent's self-declared DONE.
                    actual = worker.observe()
                    if not task.in_scope(actual.url):
                        return finish(Outcome.NEEDS_HUMAN, "Final page is outside allowed scope")
                    if all(needle.casefold() in actual.text.casefold() for needle in task.success_contains):
                        r.audit.append({"type": "verified", "checks": len(task.success_contains)})
                        return finish(Outcome.COMPLETED, "Independent on-page evidence satisfied", True)
                    return finish(Outcome.NEEDS_HUMAN, "Agent reported DONE but evidence was missing")
                if decision.terminal == "blocked":
                    return finish(Outcome.BLOCKED, "Agent reports no supported path")
                if decision.action is None:
                    return finish(Outcome.BLOCKED, "Agent proposed no action")
                action = decision.action
                try:
                    after = worker.execute(decision)
                except StaleDecision:
                    stale_retries += 1
                    if stale_retries > task.max_stale_retries:
                        return finish(Outcome.NEEDS_HUMAN, "Too many stale-page retries")
                    page = worker.observe()
                    continue
                except AmbiguousExecution:
                    return finish(Outcome.NEEDS_HUMAN, "A browser action may have happened; no automatic retry")
                stale_retries = 0
                observed.append(action)
                r.actions += 1
                r.audit.append({"type": "action", "kind": action.kind, "label_hash": self.trails.key(task, action)})
                if after.fingerprint == page.fingerprint and action.kind != "wait" and action.kind not in {"scroll_up", "scroll_down"}:
                    recent = r.audit[-3:]
                    if len(recent) == 3 and all(x.get("type") == "action" and x.get("label_hash") == recent[0].get("label_hash") for x in recent):
                        return finish(Outcome.NEEDS_HUMAN, "Repeated identical action without progress")
                page = after
        except Exception as e:
            # No raw error payload in audit; these can contain account secrets.
            r.audit.append({"type": "error", "name": type(e).__name__})
            return finish(Outcome.FAILED, f"Unexpected worker error: {type(e).__name__}")
        finally:
            if reserved:
                with self._lock:
                    self._running_keys.discard(task.dedupe_key)
            try:
                worker.close()
            except Exception:
                r.audit.append({"type": "error", "name": "WorkerCloseError"})


@dataclass(frozen=True)
class Spark:
    name: str
    hypothesis: str
    baseline_successes: int
    baseline_trials: int
    candidate_successes: int
    candidate_trials: int
    policy_violations: int = 0
    # A spark is a measured candidate, never a grant of live tool permissions.


class SparkLedger:
    """Interesting behaviors can grow into *sandbox* trials only with evidence."""

    def evaluate(self, spark: Spark) -> tuple[str, str]:
        if any(x < 0 for x in (
            spark.baseline_successes, spark.baseline_trials,
            spark.candidate_successes, spark.candidate_trials, spark.policy_violations,
        )):
            raise ValueError("Counts cannot be negative")
        if spark.baseline_successes > spark.baseline_trials or spark.candidate_successes > spark.candidate_trials:
            raise ValueError("Successes cannot exceed trials")
        if spark.policy_violations:
            return "rejected", "Policy violations prevent promotion"
        if spark.baseline_trials < 3 or spark.candidate_trials < 3:
            return "sandbox_more", "At least three trials per arm are required"
        old = spark.baseline_successes / spark.baseline_trials
        new = spark.candidate_successes / spark.candidate_trials
        if new <= old:
            return "rejected", "No measured success-rate improvement"
        return "sandbox_promising", "Improved in simulation; human approval required for live rollout"

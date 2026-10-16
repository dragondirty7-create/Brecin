from __future__ import annotations

from dataclasses import replace
import pytest

from colony.core import (
    Action, AmbiguousExecution, Colony, Decision, Observation, Outcome,
    Policy, Spark, SparkLedger, StaleDecision, Task, TrailStore,
)


URL = "https://example.org/"


def task(**kwargs):
    return replace(Task("a", "Find results", URL, ("example.org",), ("Evidence confirmed",)), **kwargs)


def obs(text="Starting", fingerprint="start", url=URL):
    return Observation(url, text, fingerprint)


class FakeWorker:
    def __init__(self, decisions, after=None, stale=0, ambiguous=False):
        self.decisions = list(decisions)
        self.current = obs()
        self.after = list(after or [])
        self.stale = stale
        self.ambiguous = ambiguous
        self.calls = []
        self.closed = False

    def observe(self):
        self.calls.append("observe")
        return self.current

    def decide(self):
        self.calls.append("decide")
        return self.decisions.pop(0)

    def execute(self, decision):
        self.calls.append("execute")
        if self.ambiguous:
            raise AmbiguousExecution()
        if self.stale:
            self.stale -= 1
            raise StaleDecision()
        self.current = self.after.pop(0)
        return self.current

    def close(self):
        self.closed = True


def click(label="Search"):
    return Decision(Action("e1", "click", label), 0.85)


def done():
    return Decision(None, 0.99, "done")


def test_safe_navigation_verifies_and_leaves_trail():
    c = Colony()
    t = task()
    a = click()
    w = FakeWorker([a, done()], [obs("Evidence confirmed", "p2")])
    result = c.run(t, w)
    assert result.outcome == Outcome.COMPLETED and result.verified
    assert result.actions == 1 and result.decisions == 2
    assert 0 < c.trails.hint(t, a.action)
    assert w.closed
    assert "Evidence confirmed" not in repr(result.audit)


def test_false_done_requires_independent_page_evidence():
    c = Colony()
    w = FakeWorker([done()])
    assert c.run(task(), w).outcome == Outcome.NEEDS_HUMAN
    assert c.trails.hint(task(), Action("e1", "click", "Search")) == 0.0


@pytest.mark.parametrize("label", ["Send email", "Purchase now", "Save changes", "Apply now", "Delete user", "Share document", "Confirm booking", "Sign in", "Update billing"])
def test_sensitive_clicks_stop_before_execution(label):
    w = FakeWorker([click(label)])
    result = Colony().run(task(), w)
    assert result.outcome == Outcome.NEEDS_HUMAN
    assert "execute" not in w.calls


@pytest.mark.parametrize("kind,label", [
    ("fill", "Password"), ("fill", "Message"), ("fill", "Credit card number"),
    ("select", "Choose setting"), ("click", "Mystery widget"),
])
def test_unknown_or_sensitive_controls_need_human(kind, label):
    w = FakeWorker([Decision(Action("a", kind, label), 0.95)])
    assert Colony().run(task(), w).outcome == Outcome.NEEDS_HUMAN
    assert "execute" not in w.calls


def test_scope_is_exact_not_subdomain_wildcard():
    t = task()
    assert not t.in_scope("https://evil.example.org/")
    assert not t.in_scope("http://example.org/")
    assert not t.in_scope("https://example.org.evil.tld/")
    with pytest.raises(ValueError):
        task(start_url="https://evil.tld/")


def test_redirect_after_click_pauses_next_step():
    w = FakeWorker([click(), done()], [obs("Evidence confirmed", "new", "https://other.org/")])
    r = Colony().run(task(), w)
    assert r.outcome == Outcome.NEEDS_HUMAN and r.actions == 1
    assert w.calls.count("execute") == 1


def test_stale_retries_bounded_and_never_assume_action_happened():
    w = FakeWorker([click(), click(), click()], stale=3)
    r = Colony().run(task(max_stale_retries=2), w)
    assert r.outcome == Outcome.NEEDS_HUMAN and r.actions == 0
    assert w.calls.count("execute") == 3


def test_ambiguous_execution_never_retried():
    w = FakeWorker([click(), click()], ambiguous=True)
    r = Colony().run(task(), w)
    assert r.outcome == Outcome.NEEDS_HUMAN and r.actions == 0
    assert w.calls.count("execute") == 1


def test_decision_budget_stops_before_next_prediction():
    w = FakeWorker([Decision(Action("w", "wait", "wait"), .5) for _ in range(8)], [obs() for _ in range(8)])
    r = Colony().run(task(max_decisions=2), w)
    assert r.outcome == Outcome.BUDGET_EXCEEDED and r.decisions == 2
    assert w.calls.count("decide") == 2


def test_estimated_cost_budget_stops_before_new_prediction():
    w = FakeWorker([Decision(Action("w", "wait", "wait"), .5) for _ in range(8)], [obs() for _ in range(8)])
    r = Colony().run(task(max_estimated_usd=.004), w)
    assert r.outcome == Outcome.BUDGET_EXCEEDED
    assert r.decisions == 2 and r.estimated_usd == .004


def test_repeated_same_action_without_progress_pauses():
    w = FakeWorker([click()] * 6, [obs("still here", "start")] * 6)
    r = Colony().run(task(), w)
    assert r.outcome == Outcome.NEEDS_HUMAN
    assert r.actions == 3


def test_completed_duplicate_is_not_rerun():
    c = Colony()
    w1 = FakeWorker([done()])
    w1.current = obs("Evidence confirmed")
    assert c.run(task(), w1).outcome == Outcome.COMPLETED
    w2 = FakeWorker([done()])
    assert c.run(task(), w2).outcome == Outcome.BLOCKED
    assert w2.calls == [] and w2.closed


def test_trails_only_from_verified_outcomes_and_decay():
    trails = TrailStore(half_life_seconds=10)
    t = task()
    a = Action("1", "click", "Search")
    trails.leave_success(t, [a], False, at=100)
    assert trails.hint(t, a, at=100) == 0
    trails.leave_success(t, [a], True, at=100)
    assert trails.hint(t, a, at=110) == .5
    assert trails.hint(t, Action("2", "click", "Delete"), at=110) == 0


def test_spark_requires_replicated_improvement_and_no_policy_violation():
    l = SparkLedger()
    assert l.evaluate(Spark("x", "Try alternate", 1, 3, 3, 3))[0] == "sandbox_promising"
    assert l.evaluate(Spark("x", "Try alternate", 1, 3, 3, 3, 1))[0] == "rejected"
    assert l.evaluate(Spark("x", "Try alternate", 1, 2, 2, 2))[0] == "sandbox_more"
    assert l.evaluate(Spark("x", "Try alternate", 3, 3, 2, 3))[0] == "rejected"
    with pytest.raises(ValueError):
        l.evaluate(Spark("x", "bad", 4, 3, 2, 3))


def test_tasks_require_evidence_and_limits():
    with pytest.raises(ValueError):
        task(success_contains=())
    with pytest.raises(ValueError):
        task(max_actions=0)
    with pytest.raises(ValueError):
        task(allowed_hosts=("Example.ORG",))


def test_current_page_is_regated_after_model_prediction():
    class RedirectDuringPrediction(FakeWorker):
        def decide(self):
            self.current = obs("Unsafe page", "changed", "https://evil.tld/")
            return super().decide()

    w = RedirectDuringPrediction([click()])
    r = Colony().run(task(), w)
    assert r.outcome == Outcome.NEEDS_HUMAN
    assert w.calls.count("execute") == 0


def test_dedupe_fingerprint_includes_requirements():
    assert task().dedupe_key != task(success_contains=("Different verified state",)).dedupe_key


def test_swarm_three_roles_run_with_cap_and_verified_outcomes():
    from colony.swarm import Role, Swarm, WorkOrder
    orders = [WorkOrder(role, task(task_id=str(i), goal=f"Find results {i}"))
              for i, role in enumerate(Role)]

    def factory(t):
        w = FakeWorker([done()])
        w.current = obs("Evidence confirmed")
        return w

    results = Swarm(max_workers=3, total_estimated_usd_cap=.3).run(orders, factory)
    assert all(r.outcome == Outcome.COMPLETED for r in results)


def test_swarm_refuses_to_begin_if_aggregate_budget_too_large():
    from colony.swarm import Role, Swarm, WorkOrder
    orders = [WorkOrder(Role.EXPLORER, task())]
    calls = []
    with pytest.raises(ValueError, match="Aggregate"):
        Swarm(total_estimated_usd_cap=.01).run(orders, lambda t: calls.append(t))
    assert calls == []


def test_inflight_duplicate_is_blocked_with_parallel_workers():
    import threading
    from colony.swarm import Role, Swarm, WorkOrder
    barrier = threading.Event()
    started = threading.Event()
    class SlowFake(FakeWorker):
        def observe(self):
            started.set()
            barrier.wait(timeout=2)
            return super().observe()
    shared = Colony()
    original = task()
    w1 = SlowFake([done()])
    w1.current = obs("Evidence confirmed")
    w2 = FakeWorker([done()])
    w2.current = obs("Evidence confirmed")
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        one = pool.submit(shared.run, original, w1)
        assert started.wait(timeout=2)
        two = pool.submit(shared.run, original, w2)
        blocked = two.result(timeout=2)
        barrier.set()
        successful = one.result(timeout=2)
    assert blocked.outcome == Outcome.BLOCKED
    assert successful.outcome == Outcome.COMPLETED
    assert w2.calls == []

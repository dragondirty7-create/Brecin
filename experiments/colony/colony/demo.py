"""Run three independent synthetic browser bots; no internet or API keys."""

from __future__ import annotations
import json

from .core import Action, Colony, Decision, Observation, Spark, SparkLedger, Task


class SyntheticWorker:
    def __init__(self, task: Task, steps: list[tuple[Action | None, Observation, str | None]]):
        self.task = task
        self.steps = steps
        self.pointer = 0
        self.current = Observation(task.start_url, "Starting", "a")
        self.closed = False

    def observe(self) -> Observation:
        return self.current

    def decide(self) -> Decision:
        action, _, terminal = self.steps[self.pointer]
        return Decision(action, 0.93, terminal)

    def execute(self, _decision: Decision) -> Observation:
        _, after, _ = self.steps[self.pointer]
        self.pointer += 1
        self.current = after
        return after

    def close(self) -> None:
        self.closed = True


def main() -> None:
    colony = Colony()
    examples = [
        ("scout", "Find relevant results", "Results found", "Search", "Results found"),
        ("verifier", "Confirm listing details", "Details confirmed", "View details", "Details confirmed"),
        ("creative", "Find alternate path", "Alternate found", "Search alternatives", "Alternate found"),
    ]
    reports = []
    for role, goal, proof, action_label, visible in examples:
        t = Task(role, goal, "https://example.org/", ("example.org",), (proof,))
        worker = SyntheticWorker(t, [
            (Action("n1", "click", action_label), Observation(t.start_url, visible, "b"), None),
            (None, Observation(t.start_url, visible, "b"), "done"),
        ])
        r = colony.run(t, worker)
        reports.append({"bot": role, "outcome": r.outcome.value, "verified": r.verified, "actions": r.actions, "human_needed": r.outcome.value == "needs_human"})
    spark = Spark("Alternate route", "Try a different read-only search", 1, 3, 3, 3)
    print(json.dumps({"runs": reports, "spark": SparkLedger().evaluate(spark)[0]}, indent=2))


if __name__ == "__main__":
    main()

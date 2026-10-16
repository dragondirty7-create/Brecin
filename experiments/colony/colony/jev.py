"""Optional bridge to https://github.com/browser-use/jev-ultrafast.

Requires jev-ultrafast, Chrome/Browser Harness, and paid model credentials.
Importing this module does NOT launch a browser or make network calls.
"""

from __future__ import annotations

from .core import Action, AmbiguousExecution, Decision, Observation, StaleDecision, Task


class JevWorker:
    """Pause Jev between prediction and execution for a deterministic gate.

    Do not use it for production logins. Jev attaches to a Chrome session;
    run in an isolated test profile with synthetic data only.
    """

    def __init__(self, task: Task):
        if not task.in_scope(task.start_url):
            raise ValueError("Out-of-scope Jev URL")
        try:
            from jev_ultrafast import Agent
        except ImportError as e:
            raise RuntimeError("Install jev-ultrafast separately; no vendor code is bundled") from e
        self._agent = Agent(task.start_url, task.goal)
        self._predicted = False

    def observe(self) -> Observation:
        page = self._agent.state["page"]
        return Observation(page["url"], page.get("text", ""), page["fingerprint"])

    def decide(self) -> Decision:
        self._agent.command("predict")
        self._predicted = True
        d = self._agent.state["decision"]
        choice = d["choice"]
        if choice in {"DONE", "BLOCKED"}:
            return Decision(action=None, confidence=float(d["confidence"]), terminal=choice.lower())
        matches = [a for a in self._agent.state["page"]["actions"] if a["id"] == choice]
        if len(matches) != 1:
            raise RuntimeError("Predicted action was not in the observed action space")
        a = matches[0]
        kind = a["kind"].lower()
        kind = {"scrollup": "scroll_up", "scrolldown": "scroll_down"}.get(kind, kind)
        return Decision(Action(key=choice, kind=kind, label=a.get("label", "")), float(d["confidence"]))

    def execute(self, decision: Decision) -> Observation:
        if not self._predicted or decision.action is None:
            raise RuntimeError("No gated proposed action")
        if decision.action.key != self._agent.state["decision"]["choice"]:
            raise RuntimeError("Decision differs from gated predicted target")
        self._predicted = False
        try:
            from jev_ultrafast.browser import StalePage
            before_actions = len(self._agent.state["history"])
            self._agent.command("act", {"fingerprint": self._agent.state["page"]["fingerprint"]})
        except StalePage as e:
            if len(self._agent.state["history"]) > before_actions:
                raise AmbiguousExecution("Observed page became stale after possible input") from e
            self._agent.state["decision"] = None
            raise StaleDecision("Page changed before action") from e
        return self.observe()

    def close(self) -> None:
        self._agent.close()

from __future__ import annotations

import sys
import types
from unittest.mock import Mock

import pytest

from colony.core import Action, Decision, StaleDecision, AmbiguousExecution, Task
from colony.jev import JevWorker


class FakeJevAgent:
    def __init__(self, url, goal):
        self.commands = []
        self.state = {
            "page": {"url": url, "text": "Starting", "fingerprint": "f1", "actions": [{"id": "c1", "label": "Search", "kind": "click"}]},
            "decision": None,
            "history": [],
        }
        self.closed = False
        self.fail = None

    def command(self, verb, details=None):
        self.commands.append(verb)
        if verb == "predict":
            self.state["decision"] = {"choice": "c1", "confidence": .9}
        elif verb == "act":
            if self.fail == "before":
                raise FakeStalePage()
            if self.fail == "after":
                self.state["history"].append({"action": "Search"})
                raise FakeStalePage()
            self.state["history"].append({"action": "Search"})
            self.state["page"]["text"] = "Results"
            self.state["page"]["fingerprint"] = "f2"

    def close(self):
        self.closed = True


class FakeStalePage(RuntimeError):
    pass


@pytest.fixture
def factory(monkeypatch):
    module = types.ModuleType("jev_ultrafast")
    module.Agent = FakeJevAgent
    browser = types.ModuleType("jev_ultrafast.browser")
    browser.StalePage = FakeStalePage
    monkeypatch.setitem(sys.modules, "jev_ultrafast", module)
    monkeypatch.setitem(sys.modules, "jev_ultrafast.browser", browser)
    t = Task("a", "Search web", "https://example.org", ("example.org",), ("Results",))
    return JevWorker(t)


def test_jew_worker_proposal_is_not_an_action(factory):
    d = factory.decide()
    assert d.action.label == "Search"
    assert factory._agent.commands == ["predict"]
    assert factory.execute(d).text == "Results"
    assert factory._agent.commands == ["predict", "act"]
    factory.close()
    assert factory._agent.closed


def test_jew_worker_cannot_execute_a_swapped_action(factory):
    factory.decide()
    with pytest.raises(RuntimeError, match="differs"):
        factory.execute(Decision(Action("invented", "click", "Search"), .9))
    assert factory._agent.commands == ["predict"]


@pytest.mark.parametrize("location,error", [
    ("before", StaleDecision), ("after", AmbiguousExecution)
])
def test_jew_worker_handles_stale_execution_without_double_action(factory, location, error):
    d = factory.decide()
    factory._agent.fail = location
    with pytest.raises(error):
        factory.execute(d)
    assert factory._agent.commands.count("act") == 1

# Antfire Colony (experimental v0.1)

**A small, bounded supervisor for AI-controlled browser workers.**

The research inspiration is the ant-colony / distributed-intelligence analogy documented in *Emerging Intelligence: When the System Becomes More Than the Parts*. Useful paths leave evidence-backed, decaying "trails." Bots work independently inside narrow scopes. A "spark" is an unusual strategy we can test, not a permission for a bot to rewrite itself or touch production. Humans intervene only for ambiguity, failures, spending, credentials, messages, publishing, or other consequential changes.

## What actually works in this slice

- **Policy gate before each browser action**, not just an LLM instruction. Safe read-only navigation, search and waiting are eligible for auto-execution. Account-changing or unknown actions pause for review.
- **Independent DONE verification** against explicit observable text and approved host; a model's "DONE" is insufficient.
- **Caps** for model decisions, browser actions, estimated spend, time and stale retries.
- **No retry when execution is ambiguous** (prevents accidental duplicate submissions).
- **Pheromone-like trails** reward *verified* actions only, decay over time and never authorize later actions by themselves.
- **Spark ledger** promotes improved strategies only to more *sandbox* evaluation, never to live autonomous execution.
- **Duplicate-task leasing** while work is running and after verified completion, even when multiple synthetic workers compete.
- **Explorer / Skeptic / Integrator swarm roles** with a shared aggregate budget reservation and a capped worker pool. Real Jev workers default to a single browser lane until browser-profile isolation is implemented.
- **Optional Jev adapter** uses Jev's public `predict`/`act` boundary. Vendor code is **not** copied into this repo.
- **Synthetic demonstration and offline tests** work without accounts, networking, browser setup or paid APIs.

```bash
cd experiments/colony
python3 -m pytest -q
python3 -m colony.demo
```

### Jev adapter (optional / NOT automatically launched)

For a dedicated synthetic-data test machine, install Jev Ultrafast separately using [upstream instructions](https://github.com/browser-use/jev-ultrafast), configure its API keys and isolated Chrome test profile, then:

```python
from colony import Colony, Task
from colony.jev import JevWorker

task = Task(
    task_id="public-article-demo",
    goal="Find a Wikipedia article and stop when the heading is visible",
    start_url="https://en.wikipedia.org/wiki/Main_Page",
    allowed_hosts=("en.wikipedia.org",),
    success_contains=("Wikipedia",),
)
result = Colony().run(task, JevWorker(task))
print(result.outcome, result.verified)
```

The above is an *example*, not a reported successful live run. The wrapper has no credential vault and does **not** claim robust support for frames, downloads, uploads, or logged-in workflows. Use it only after checking the current upstream Jev API. The host-specific read-only heuristics intentionally fail closed on unknown interactions; expanded browser coverage requires additional controls and tests.

## Why this improves on baseline Jev *without claiming to beat its speed*

The upstream Jev agent is exceptionally optimized for individual browser actions, but its own README identifies an MVP with unsupported complex DOM structures. This prototype adds a **supervisory reliability layer**: an approval gate that can prevent an action, independent outcomes, expense/time limits, evidence trails, no-progress detection and safe "spark" experiments. These are product capabilities, **not yet measured performance wins**. Live timing and success-rate claims require a fair same-site benchmark with identical models, sessions and budgets.

## Next engineering milestones

1. Add a dedicated isolated browser context and policy-authorized origin transitions; don't inherit a normal signed-in Chrome session.
2. Run 20+ identical read-only public search tasks via Jev and TinyFish with matched success checks. Track median, p95, verified pass rate, cost per verified success, human interventions, and policy violations.
3. Add a persistent, crash-recoverable queue and isolated per-worker Chrome contexts before raising live Jev concurrency beyond one. Current in-memory leases cover only one process. No unbounded recursive agents.
4. Introduce selective memory: high-performing read-only paths can inform proposals, never bypass review or create new powers.
5. Wire verified public lead discoveries into Project Presser's **private owner-controlled** review lane only after authentication/privacy QA; never scrape or publish client data into the demo.

### Permission boundaries

No payment, email, proposals, bookings, credential input, login, customer-data access, DNS change, site publication, security setting change, or production merge is authorized by this demo. Local simulated workers need no secrets. The live adapter requires deliberate separately authorized setup.

## Research provenance

- Canonical EEC TAO, Oct 15: build-your-own browser-agent idea explicitly marked as unimplemented research backlog before this experiment.
- *Emerging Intelligence: When the System Becomes More Than the Parts*, EEC Drive, Sep 26: architecture matters; groups can amplify both intelligence and error.
- [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) source and README, consulted Oct 15, 2026. Its 7.1s Google Flights demo is not a general comparative benchmark.

**Status:** v0.1 isolated prototype only. No live Jev or TinyFish performance comparison yet. No agent currently runs unattended.

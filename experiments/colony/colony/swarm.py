"""Independent bounded workers; one owner per task, no recursive spawning."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from enum import Enum
from typing import Callable

from .core import BrowserWorker, Colony, RunReport, Task


class Role(str, Enum):
    EXPLORER = "explorer"  # Generates/visits alternative read-only paths.
    SKEPTIC = "skeptic"    # Checks original evidence / disconfirms weak leads.
    INTEGRATOR = "integrator"  # Resolves candidate evidence and reports status.


@dataclass(frozen=True)
class WorkOrder:
    role: Role
    task: Task


class Swarm:
    """Run independent assignments with task leases and total budget reservation.

    Real Jev workers share a Chrome profile by default. Keep parallelism at 1
    unless every worker has a separately isolated browser/profile/session.
    Synthetic fixtures can safely use >1 to exercise coordination.
    """

    def __init__(self, *, colony: Colony | None = None, max_workers: int = 1,
                 total_estimated_usd_cap: float = 0.25):
        if not (1 <= max_workers <= 4):
            raise ValueError("Workers must be between 1 and 4")
        if total_estimated_usd_cap <= 0:
            raise ValueError("Total reserved budget must be positive")
        self.colony = colony or Colony()
        self.max_workers = max_workers
        self.total_estimated_usd_cap = total_estimated_usd_cap

    def run(self, orders: list[WorkOrder], factory: Callable[[Task], BrowserWorker]) -> list[RunReport]:
        if not orders:
            return []
        reserved = sum(o.task.max_estimated_usd for o in orders)
        if reserved > self.total_estimated_usd_cap + 1e-9:
            raise ValueError("Aggregate task budget exceeds swarm cap; no work started")

        def single(order: WorkOrder) -> RunReport:
            # Factory is deliberately called *inside* the claimed worker lane;
            # no private data is copied into a shared action log.
            return self.colony.run(order.task, factory(order.task))

        with ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="antfire") as pool:
            return list(pool.map(single, orders))

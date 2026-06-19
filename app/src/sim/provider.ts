// The capability-contract port (spec §15) — the seam between the control loop
// and a cloud. The simulator (./sim) implements it against an in-memory fake
// cloud; a real implementation would target AWS. The loop above this seam does
// not change.

import type { DesiredResource, Observation, ResourceID } from "./model";

export interface Provider {
  name(): string;
  /** Converge a single resource toward its desired spec. Idempotent. */
  apply(d: DesiredResource): void;
  /** Remove a resource (retirement / transition contract phase). */
  delete(id: ResourceID): void;
  observe(id: ResourceID): Observation;
  observeAll(): Observation[];
}

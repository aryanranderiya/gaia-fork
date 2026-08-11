import { afterEach, describe, expect, it, vi } from "vitest";
import { wideLog, withWideEvent } from "./wide-events";

/**
 * The Python twin of these assertions lives in
 * apps/api/tests/integration/api/test_wide_event_contracts.py. They are here
 * separately because the wide-event-conformance lane compares only the
 * TOP-LEVEL key -> JSON-type shape of an event: a namespace stays `"object"`
 * whether or not its keys survived, so that lane structurally cannot catch a
 * clobbering regression. These tests can.
 */

/** Run `body` inside a boundary and return the emitted event line, parsed. */
async function captureEvent(
  body: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const spies = (["log", "warn", "error", "debug"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((line: unknown) => {
      if (typeof line === "string") lines.push(line);
    }),
  );
  try {
    await withWideEvent(
      "test_task",
      { platform: "cli", component: "test" },
      body,
    );
  } finally {
    for (const spy of spies) spy.mockRestore();
  }

  const events = lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })
    .filter((e): e is Record<string, unknown> => e?.task === "test_task");

  expect(events).toHaveLength(1);
  return events[0];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wideLog.set namespace merging", () => {
  it("merges a second write of a namespace instead of replacing it", async () => {
    const event = await captureEvent(async () => {
      wideLog.set({ workflow: { id: "wf_1", trigger_type: "schedule" } });
      wideLog.set({ workflow: { status: "success", duration_ms: 12 } });
    });

    expect(event.workflow).toEqual({
      id: "wf_1",
      trigger_type: "schedule",
      status: "success",
      duration_ms: 12,
    });
  });

  it("treats set and setNs as interchangeable", async () => {
    const event = await captureEvent(async () => {
      wideLog.set({ todo: { operation: "create" } });
      wideLog.setNs("todo", { id: "t_1" });
      wideLog.set({ todo: { result_count: 2 } });
    });

    expect(event.todo).toEqual({
      operation: "create",
      id: "t_1",
      result_count: 2,
    });
  });

  it("still replaces when either side is not a plain object", async () => {
    const event = await captureEvent(async () => {
      wideLog.set({ stage: "pending", todo: { operation: "create" } });
      wideLog.set({ stage: "done", todo: "replaced-by-scalar" });
    });

    expect(event.stage).toBe("done");
    expect(event.todo).toBe("replaced-by-scalar");
  });
});

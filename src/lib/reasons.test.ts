// Raw RPC codes must never reach a toast (audit P1-13): every known code maps
// to a dictionary key, everything unknown routes through oops().
import { describe, it, expect, beforeEach, vi } from "vitest";

const toastError = vi.fn();
const oopsMock = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/lib/oops", () => ({ oops: (...a: unknown[]) => oopsMock(...a) }));

import { reasonToast } from "./reasons";

const t = (k: string) => `T(${k})`;

beforeEach(() => { toastError.mockClear(); oopsMock.mockClear(); });

describe("reasonToast", () => {
  it.each([
    ["taken", "sos.err_taken"],
    ["expired", "sos.err_expired"],
    ["own_sos", "sos.err_own"],
    ["already_in", "sos.already_in"],
    ["already_applied", "app.already"],
    ["bad_proposed_time", "app.time_outside"],
    ["no_application", "app.gone"],
    ["not_participant", "reason.not_participant"],
    ["not_found", "reason.gone"],
    ["not_yours", "reason.gone"],
    ["full", "ev.full_label"],
    ["past", "ev.past"],
  ])("maps %s → t(%s)", (code, key) => {
    reasonToast(t, code);
    expect(toastError).toHaveBeenCalledWith(`T(${key})`);
    expect(oopsMock).not.toHaveBeenCalled();
  });

  it("unknown codes go through oops with the raw code preserved", () => {
    reasonToast(t, "weird_pg_error");
    expect(toastError).not.toHaveBeenCalled();
    expect(oopsMock).toHaveBeenCalledTimes(1);
    expect(String((oopsMock.mock.calls[0][0] as Error).message)).toBe("weird_pg_error");
  });

  it("null / undefined reasons oops as unknown", () => {
    reasonToast(t, null);
    reasonToast(t, undefined);
    expect(oopsMock).toHaveBeenCalledTimes(2);
    expect(String((oopsMock.mock.calls[0][0] as Error).message)).toBe("unknown");
  });
});

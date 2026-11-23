import { describe, expect, it } from "vitest";
import { loginFor, movedFrom, safeNext } from "./routes";

describe("HQ and the Session Desk", () => {
  it("moves old /admin addresses to their new home", () => {
    expect(movedFrom("/admin")).toBe("/savvy-hq");
    expect(movedFrom("/admin/tasks")).toBe("/savvy-hq/tasks");
    expect(movedFrom("/admin/act/abc.def")).toBe("/savvy-hq/act/abc.def");
    expect(movedFrom("/admin/login")).toBe("/savvy-hq/login");
    expect(movedFrom("/admin/sessions")).toBe("/session-desk");
  });

  it("sends each area to its own sign-in page", () => {
    expect(loginFor("/session-desk")).toBe("/session-desk/login");
    expect(loginFor("/session-desk/anything")).toBe("/session-desk/login");
    expect(loginFor("/savvy-hq/tasks")).toBe("/savvy-hq/login");
    expect(loginFor("/session-desks")).toBe("/savvy-hq/login");
  });

  it("only goes back to one of the two areas after signing in", () => {
    expect(safeNext("/session-desk")).toBe("/session-desk");
    expect(safeNext("/savvy-hq/tasks")).toBe("/savvy-hq/tasks");
    expect(safeNext("/session-desk/login")).toBe("/session-desk");
    expect(safeNext("https://example.test")).toBe("/savvy-hq");
    expect(safeNext("//example.test")).toBe("/savvy-hq");
    expect(safeNext("/savvy-hq//example.test")).toBe("/savvy-hq");
    expect(safeNext(null)).toBe("/savvy-hq");
  });
});

import { describe, it, expect } from "vitest";
import { errorMessageKey } from "../api/errorMessages";

describe("errorMessageKey", () => {
  it("maps each known code to its errors.* key", () => {
    expect(errorMessageKey({ code: "auth" })).toBe("errors.authFailed");
    expect(errorMessageKey({ code: "quota" })).toBe("errors.quotaExceeded");
    expect(errorMessageKey({ code: "timeout" })).toBe("errors.timeout");
    expect(errorMessageKey({ code: "network" })).toBe("errors.network");
    expect(errorMessageKey({ code: "jsonRetryExhausted" })).toBe(
      "errors.jsonRetryExhausted",
    );
    expect(errorMessageKey({ code: "serde" })).toBe(
      "errors.invalidResponse",
    );
    expect(errorMessageKey({ code: "http" })).toBe("errors.httpFailed");
    expect(errorMessageKey({ code: "io" })).toBe("errors.ioError");
  });

  it("falls back to errors.unknown for unrecognized codes", () => {
    expect(errorMessageKey({ code: "teapot" })).toBe("errors.unknown");
    expect(errorMessageKey({ code: "" })).toBe("errors.unknown");
  });

  it("ignores the detail field when mapping", () => {
    expect(errorMessageKey({ code: "auth", detail: "401 from server" })).toBe(
      "errors.authFailed",
    );
  });
});

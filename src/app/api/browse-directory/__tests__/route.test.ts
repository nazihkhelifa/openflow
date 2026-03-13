import { describe, it, expect } from "vitest";
import { normalizeSelectedPath } from "../route";

describe("normalizeSelectedPath", () => {
  it("should strip hostname prefix on macOS", () => {
    expect(normalizeSelectedPath("AT-ALGKG9VR/Users/guy/Desktop", "darwin"))
      .toBe("/Users/guy/Desktop");
  });

  it("should preserve absolute paths on macOS", () => {
    expect(normalizeSelectedPath("/Users/guy/Desktop", "darwin"))
      .toBe("/Users/guy/Desktop");
  });

  it("should remove trailing slash", () => {
    expect(normalizeSelectedPath("/Users/guy/Desktop/", "darwin"))
      .toBe("/Users/guy/Desktop");
  });

  it("should strip hostname and trailing slash", () => {
    expect(normalizeSelectedPath("HOST/Users/guy/", "darwin"))
      .toBe("/Users/guy");
  });

  it("should strip hostname prefix on Linux", () => {
    expect(normalizeSelectedPath("hostname/home/user", "linux"))
      .toBe("/home/user");
  });

  it("should not modify Windows drive paths", () => {
    expect(normalizeSelectedPath("C:\\Users\\guy", "win32"))
      .toBe("C:\\Users\\guy");
  });

  it("should preserve Windows drive root with backslash", () => {
    expect(normalizeSelectedPath("C:\\", "win32"))
      .toBe("C:\\");
  });

  it("should preserve Windows drive root with forward slash", () => {
    expect(normalizeSelectedPath("C:/", "win32"))
      .toBe("C:/");
  });

  it("should preserve Unix root /", () => {
    expect(normalizeSelectedPath("/", "darwin"))
      .toBe("/");
  });

  it("should leave hostname-only (no slash) as-is", () => {
    expect(normalizeSelectedPath("HOSTNAME", "darwin"))
      .toBe("HOSTNAME");
  });
});

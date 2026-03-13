import { describe, it, expect } from "vitest";
import { validateMediaUrl } from "../urlValidation";

describe("validateMediaUrl", () => {
  it("allows valid HTTPS URLs", () => {
    expect(validateMediaUrl("https://example.com/image.png")).toEqual({ valid: true });
    expect(validateMediaUrl("https://cdn.kie.ai/output/abc.mp4")).toEqual({ valid: true });
  });

  it("allows valid HTTP URLs", () => {
    expect(validateMediaUrl("http://example.com/image.png")).toEqual({ valid: true });
  });

  it("blocks non-http protocols", () => {
    expect(validateMediaUrl("file:///etc/passwd")).toEqual({ valid: false, error: "Blocked protocol: file:" });
    expect(validateMediaUrl("ftp://example.com/file")).toEqual({ valid: false, error: "Blocked protocol: ftp:" });
    expect(validateMediaUrl("javascript:alert(1)")).toEqual({ valid: false, error: "Blocked protocol: javascript:" });
  });

  it("blocks localhost", () => {
    const result = validateMediaUrl("http://localhost:3000/api/secret");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked host");
  });

  it("blocks IPv6 loopback", () => {
    const result = validateMediaUrl("http://[::1]:8080/");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked host");
  });

  it("blocks 127.x.x.x loopback", () => {
    const result = validateMediaUrl("http://127.0.0.1/api");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked private IP");
  });

  it("blocks 10.x private IPs", () => {
    const result = validateMediaUrl("http://10.0.0.1/internal");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked private IP");
  });

  it("blocks 172.16-31.x private IPs", () => {
    expect(validateMediaUrl("http://172.16.0.1/")).toEqual({ valid: false, error: "Blocked private IP: 172.16.0.1" });
    expect(validateMediaUrl("http://172.31.255.1/")).toEqual({ valid: false, error: "Blocked private IP: 172.31.255.1" });
    // 172.32.x should be allowed
    expect(validateMediaUrl("http://172.32.0.1/")).toEqual({ valid: true });
  });

  it("blocks 192.168.x private IPs", () => {
    const result = validateMediaUrl("http://192.168.1.1/admin");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked private IP");
  });

  it("blocks 169.254.x link-local", () => {
    const result = validateMediaUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked private IP");
  });

  it("blocks 0.0.0.0", () => {
    const result = validateMediaUrl("http://0.0.0.0/");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked private IP");
  });

  it("rejects invalid URLs", () => {
    expect(validateMediaUrl("not-a-url")).toEqual({ valid: false, error: "Invalid URL" });
    expect(validateMediaUrl("")).toEqual({ valid: false, error: "Invalid URL" });
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Mock ResizeObserver for React Flow tests
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = ResizeObserverMock;

// Mock DOMMatrixReadOnly for React Flow
class DOMMatrixReadOnlyMock {
  m22: number = 1;
  constructor() {
    this.m22 = 1;
  }
}

global.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;

// Cleanup after each test to ensure DOM is reset
afterEach(() => {
  cleanup();
});

import * as path from "path";

/**
 * Validates a workflow directory path to prevent path traversal attacks.
 * Ensures the path is absolute, doesn't contain traversal sequences,
 * and doesn't point to dangerous system directories.
 */
export function validateWorkflowPath(inputPath: string): {
  valid: boolean;
  resolved: string;
  error?: string;
} {
  // Must be an absolute path
  if (!path.isAbsolute(inputPath)) {
    return {
      valid: false,
      resolved: inputPath,
      error: "Path must be absolute",
    };
  }

  // Resolve the path and ensure it equals the input (catches .. traversal)
  const resolved = path.resolve(inputPath);
  if (resolved !== inputPath) {
    return {
      valid: false,
      resolved,
      error: "Path contains traversal sequences",
    };
  }

  // Block known dangerous system directories
  const dangerousPrefixes = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/sys",
    "/proc",
    "/var/run",
    "/System",
    "/Library",
  ];

  for (const prefix of dangerousPrefixes) {
    if (resolved.startsWith(prefix + "/") || resolved === prefix) {
      return {
        valid: false,
        resolved,
        error: `Access to ${prefix} is not allowed`,
      };
    }
  }

  return {
    valid: true,
    resolved,
  };
}

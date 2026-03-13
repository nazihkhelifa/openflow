export interface FileProject {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  source: "file";
  thumbnail?: string;
}

export function isFileProjectId(id: string): boolean {
  try {
    const decoded = decodeURIComponent(id);
    return (
      decoded.includes("\\") ||
      decoded.includes("/") ||
      /^[A-Za-z]:/.test(decoded)
    );
  } catch {
    return false;
  }
}

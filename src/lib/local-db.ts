import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { WorkflowFile } from "@/store/workflowStore";

export interface LocalProject {
  id: string;
  name: string;
  content: WorkflowFile;
  createdAt: string;
  updatedAt: string;
  image: string | null;
}

interface OpenflowDB extends DBSchema {
  projects: {
    key: string;
    value: LocalProject;
    indexes: { "by-updated": string };
  };
}

const DB_NAME = "openflows-local";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OpenflowDB>> | null = null;

function getDB(): Promise<IDBPDatabase<OpenflowDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<OpenflowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const projectStore = db.createObjectStore("projects", { keyPath: "id" });
        projectStore.createIndex("by-updated", "updatedAt");
      },
    });
  }
  return dbPromise;
}

const emptyWorkflow: WorkflowFile = {
  version: 1,
  name: "Untitled Project",
  nodes: [],
  edges: [],
  edgeStyle: "angular",
  groups: {},
};

export async function createProject(
  data: Partial<LocalProject> & { name: string }
): Promise<LocalProject> {
  const db = await getDB();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const project: LocalProject = {
    id,
    name: data.name,
    content: data.content ?? {
      ...emptyWorkflow,
      id,
      name: data.name,
    },
    createdAt: now,
    updatedAt: now,
    image: data.image ?? null,
  };
  await db.put("projects", project);
  return project;
}

export async function getProject(id: string): Promise<LocalProject | null> {
  const db = await getDB();
  return (await db.get("projects", id)) ?? null;
}

export async function updateProject(
  id: string,
  data: Partial<Pick<LocalProject, "name" | "content" | "image">>
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("projects", id);
  if (!existing) return;
  await db.put("projects", {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("projects", id);
}

export async function listProjects(): Promise<LocalProject[]> {
  const db = await getDB();
  const all = await db.getAll("projects");
  return all.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

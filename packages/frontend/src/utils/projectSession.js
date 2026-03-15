const CURRENT_PROJECT_CONTEXT_KEY = "currentProjectContext";
const LEGACY_PROJECT_NAME_KEY = "projectName";
const LEGACY_ALT_PROJECT_ID_KEY = "altProjectId";
const PROJECT_CONTEXT_KEY_PREFIX = "projectContext:";
const PROJECT_SELECTION_KEY_PREFIXES = ["parameter_checker_selected_model_", "wbs_planner_selected_model_"];

const toText = (value) => String(value ?? "").trim();

const canUseSessionStorage = () => typeof window !== "undefined" && Boolean(window.sessionStorage);

const buildProjectContextStorageKey = (projectId) => `${PROJECT_CONTEXT_KEY_PREFIX}${toText(projectId)}`;

const buildEmptyProjectContext = (projectId = "") => ({
  projectId: toText(projectId),
  projectName: "",
  altProjectId: "",
});

const parseStoredContext = (value) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      projectId: toText(parsed.projectId),
      projectName: toText(parsed.projectName),
      altProjectId: toText(parsed.altProjectId),
    };
  } catch {
    return null;
  }
};

export const saveProjectSessionContext = ({ projectId, projectName, altProjectId } = {}) => {
  if (!canUseSessionStorage()) return;

  const context = {
    projectId: toText(projectId),
    projectName: toText(projectName),
    altProjectId: toText(altProjectId),
  };

  if (context.projectId) {
    window.sessionStorage.setItem(buildProjectContextStorageKey(context.projectId), JSON.stringify(context));
  }

  window.sessionStorage.setItem(CURRENT_PROJECT_CONTEXT_KEY, JSON.stringify(context));

  if (context.projectName) {
    window.sessionStorage.setItem(LEGACY_PROJECT_NAME_KEY, context.projectName);
  }

  if (context.altProjectId) {
    window.sessionStorage.setItem(LEGACY_ALT_PROJECT_ID_KEY, context.altProjectId);
  }
};

export const getProjectSessionContext = (projectId = "") => {
  if (!canUseSessionStorage()) {
    return buildEmptyProjectContext(projectId);
  }

  const normalizedProjectId = toText(projectId);
  if (normalizedProjectId) {
    const byProject = parseStoredContext(window.sessionStorage.getItem(buildProjectContextStorageKey(normalizedProjectId)));
    return {
      projectId: byProject?.projectId || normalizedProjectId,
      projectName: byProject?.projectName || "",
      altProjectId: byProject?.altProjectId || "",
    };
  }

  const current = parseStoredContext(window.sessionStorage.getItem(CURRENT_PROJECT_CONTEXT_KEY));

  return {
    projectId: current?.projectId || "",
    projectName: current?.projectName || toText(window.sessionStorage.getItem(LEGACY_PROJECT_NAME_KEY)),
    altProjectId: current?.altProjectId || toText(window.sessionStorage.getItem(LEGACY_ALT_PROJECT_ID_KEY)),
  };
};

export const getProjectNameFromSession = (projectId = "") =>
  getProjectSessionContext(projectId).projectName || "";

export const resolveProjectSessionContext = async ({ projectId, apiBase, fetchImpl } = {}) => {
  const normalizedProjectId = toText(projectId);
  if (!normalizedProjectId) return getProjectSessionContext("");

  const cachedContext = getProjectSessionContext(normalizedProjectId);
  if (cachedContext.projectName) return cachedContext;

  const requester =
    typeof fetchImpl === "function"
      ? fetchImpl
      : typeof window !== "undefined" && typeof window.fetch === "function"
        ? window.fetch.bind(window)
        : null;
  const normalizedApiBase = toText(apiBase).replace(/\/$/, "");

  if (!requester || !normalizedApiBase) {
    return buildEmptyProjectContext(normalizedProjectId);
  }

  try {
    const response = await requester(`${normalizedApiBase}/aec/graphql-projects`, {
      credentials: "include",
    });
    if (!response.ok) {
      return buildEmptyProjectContext(normalizedProjectId);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return buildEmptyProjectContext(normalizedProjectId);
    }

    const payload = await response.json();
    const projects = Array.isArray(payload?.data?.aecProjects) ? payload.data.aecProjects : [];
    const matchedProject =
      projects.find((project) => toText(project?.id) === normalizedProjectId) || null;

    if (!matchedProject) {
      return buildEmptyProjectContext(normalizedProjectId);
    }

    const resolvedContext = {
      projectId: normalizedProjectId,
      projectName: toText(matchedProject?.name),
      altProjectId: toText(matchedProject?.alternativeIdentifiers?.dataManagementAPIProjectId),
    };

    saveProjectSessionContext(resolvedContext);
    return resolvedContext;
  } catch {
    return buildEmptyProjectContext(normalizedProjectId);
  }
};

export const clearProjectSessionContext = () => {
  if (!canUseSessionStorage()) return;

  const keysToRemove = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (!key) continue;

    if (
      key === CURRENT_PROJECT_CONTEXT_KEY ||
      key === LEGACY_PROJECT_NAME_KEY ||
      key === LEGACY_ALT_PROJECT_ID_KEY ||
      key.startsWith(PROJECT_CONTEXT_KEY_PREFIX) ||
      PROJECT_SELECTION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
};

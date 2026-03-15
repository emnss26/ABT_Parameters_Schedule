const CURRENT_PROJECT_CONTEXT_KEY = "currentProjectContext";
const LEGACY_PROJECT_NAME_KEY = "projectName";
const LEGACY_ALT_PROJECT_ID_KEY = "altProjectId";
const PROJECT_CONTEXT_KEY_PREFIX = "projectContext:";

const toText = (value) => String(value ?? "").trim();

const canUseSessionStorage = () => typeof window !== "undefined" && Boolean(window.sessionStorage);

const buildProjectContextStorageKey = (projectId) => `${PROJECT_CONTEXT_KEY_PREFIX}${toText(projectId)}`;

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
    return { projectId: "", projectName: "", altProjectId: "" };
  }

  const normalizedProjectId = toText(projectId);
  const byProject =
    normalizedProjectId && parseStoredContext(window.sessionStorage.getItem(buildProjectContextStorageKey(normalizedProjectId)));
  const current = parseStoredContext(window.sessionStorage.getItem(CURRENT_PROJECT_CONTEXT_KEY));

  return {
    projectId: byProject?.projectId || current?.projectId || normalizedProjectId,
    projectName:
      byProject?.projectName ||
      current?.projectName ||
      toText(window.sessionStorage.getItem(LEGACY_PROJECT_NAME_KEY)),
    altProjectId:
      byProject?.altProjectId ||
      current?.altProjectId ||
      toText(window.sessionStorage.getItem(LEGACY_ALT_PROJECT_ID_KEY)),
  };
};

export const getProjectNameFromSession = (projectId = "") =>
  getProjectSessionContext(projectId).projectName || "";

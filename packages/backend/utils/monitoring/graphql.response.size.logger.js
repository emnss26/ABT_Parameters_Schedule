const ENABLE_GRAPHQL_SIZE_LOGS = process.env.GRAPHQL_SIZE_LOGS !== "false";

const usageState = {
  totalBytes: 0,
  totalRequests: 0,
};

const toMegabytes = (bytes) => bytes / (1024 * 1024);

const extractOperationName = (query = "", fallback = "anonymous") => {
  const text = String(query || "");
  const match = text.match(/\b(query|mutation|subscription)\s+([A-Za-z0-9_]+)/);
  return match?.[2] || fallback;
};

const calculatePayloadBytes = (payload) => {
  try {
    return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
  } catch {
    return 0;
  }
};

const logGraphQlResponseSize = ({ provider = "GraphQL", query = "", payload = null, operationName = "" }) => {
  if (!ENABLE_GRAPHQL_SIZE_LOGS) return;

  const bytes = calculatePayloadBytes(payload);
  usageState.totalBytes += bytes;
  usageState.totalRequests += 1;

  const resolvedOperation = extractOperationName(query, operationName || "anonymous");
  const mb = toMegabytes(bytes);
  const cumulativeMb = toMegabytes(usageState.totalBytes);

  console.log(
    `[GraphQL-METER] provider=${provider} op=${resolvedOperation} bytes=${bytes} mb=${mb.toFixed(
      4
    )} cumulative_mb=${cumulativeMb.toFixed(4)} requests=${usageState.totalRequests}`
  );
};

module.exports = {
  logGraphQlResponseSize,
};


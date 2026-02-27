const axios = require("axios")
const { logGraphQlResponseSize } = require("../../../utils/monitoring/graphql.response.size.logger")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"
const ELEMENT_PAGE_LIMIT = 500
const BULK_CONTEXT_FILTER = "'property.name.Element Context'==Instance"
const WITH_CONTEXT_COVERAGE_THRESHOLD = Number.parseFloat(
  process.env.AEC_WITH_CONTEXT_COVERAGE_THRESHOLD || "0.7"
)
const ELEMENT_GROUPS_CACHE_TTL_MS = Number.parseInt(
  process.env.AEC_ELEMENT_GROUPS_CACHE_TTL_MS || String(15 * 60 * 1000),
  10
)
const DEFAULT_TOKEN_SCOPE = "__default_scope__"

const elementGroupsCache = new Map()
const elementGroupsInFlight = new Map()

const CATEGORY_ALIASES = {
  "Curtain Panels / Mullions": [
    "CurtainPanels",
    "CurtainPanel",
    "CurtainWallMullions",
    "CurtainMullions",
    "CurtainPanelsMullions",
  ],
}

const toText = (value) => {
  if (value === undefined || value === null) return ""

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim()
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(", ")
  }

  if (typeof value === "object") {
    if ("displayValue" in value) return toText(value.displayValue)
    if ("value" in value) return toText(value.value)
    if ("name" in value) return toText(value.name)
    if ("label" in value) return toText(value.label)
  }

  return ""
}

const normalizeKey = (value) =>
  toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const compactKey = (value) => normalizeKey(value).replace(/\s+/g, "")

const toPositiveInt = (value) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) return null
    return value
  }

  const normalized = String(value || "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null
  return parsed
}

const toPropertyLabel = (property = {}) =>
  toText(property?.name) || toText(property?.definition?.name) || toText(property?.definition?.description)

const pickProperty = (properties, names, tokenGroups = []) => {
  const wanted = (Array.isArray(names) ? names : [names]).map(normalizeKey).filter(Boolean)
  const wantedCompact = wanted.map(compactKey).filter(Boolean)
  const source = Array.isArray(properties) ? properties : []

  const exact = source.find((property) => {
    const label = toPropertyLabel(property)
    if (!label) return false
    const key = normalizeKey(label)
    const compact = compactKey(label)
    return wanted.includes(key) || wantedCompact.includes(compact)
  })
  if (exact) return toText(exact?.value)

  const partial = source.find((property) => {
    const label = toPropertyLabel(property)
    if (!label) return false
    const key = normalizeKey(label)
    const compact = compactKey(label)
    return wanted.some((alias, idx) => {
      const aliasCompact = wantedCompact[idx]
      return (
        key.includes(alias) ||
        alias.includes(key) ||
        compact.includes(aliasCompact) ||
        aliasCompact.includes(compact)
      )
    })
  })
  if (partial) return toText(partial?.value)

  if (Array.isArray(tokenGroups) && tokenGroups.length > 0) {
    const byTokens = source.find((property) => {
      const key = normalizeKey(toPropertyLabel(property))
      if (!key) return false
      return tokenGroups.some((group) =>
        group
          .map((token) => normalizeKey(token))
          .filter(Boolean)
          .every((token) => key.includes(token))
      )
    })
    if (byTokens) return toText(byTokens?.value)
  }

  return ""
}

const graphQlPost = async (token, query, variables) => {
  const { data } = await axios.post(
    AEC_GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  logGraphQlResponseSize({
    provider: "AEC",
    query,
    payload: data,
  })

  const gqlErrors = data?.errors
  if (Array.isArray(gqlErrors) && gqlErrors.length) {
    throw new Error(gqlErrors[0]?.message || "AEC GraphQL error")
  }

  return data?.data || {}
}

const clampCoverageThreshold = (value) => {
  if (!Number.isFinite(value)) return 0.7
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const getTokenScope = (token) => {
  const raw = toText(token)
  if (!raw) return DEFAULT_TOKEN_SCOPE

  const parts = raw.split(".")
  if (parts.length < 2) return raw.slice(0, 24) || DEFAULT_TOKEN_SCOPE

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return (
      toText(payload?.sub) ||
      toText(payload?.client_id) ||
      toText(payload?.aud) ||
      raw.slice(0, 24) ||
      DEFAULT_TOKEN_SCOPE
    )
  } catch (_) {
    return raw.slice(0, 24) || DEFAULT_TOKEN_SCOPE
  }
}

const buildElementGroupsCacheKey = (projectId, token) => `${toText(projectId)}::${getTokenScope(token)}`

const getCachedElementGroups = (cacheKey) => {
  const cached = elementGroupsCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    elementGroupsCache.delete(cacheKey)
    return null
  }

  return cached.value
}

const setCachedElementGroups = (cacheKey, value) => {
  const minTtlMs = 10 * 60 * 1000
  const maxTtlMs = 30 * 60 * 1000
  const ttlMs = Math.min(maxTtlMs, Math.max(minTtlMs, ELEMENT_GROUPS_CACHE_TTL_MS))

  elementGroupsCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

const mapElementToRow = (element) => {
  const properties = Array.isArray(element?.properties?.results) ? element.properties.results : []
  const rawProperties = properties.map((property) => ({
    name: toText(property?.name),
    value: property?.value ?? null,
    definition: {
      id: toText(property?.definition?.id),
      name: toText(property?.definition?.name),
      description: toText(property?.definition?.description),
      specification: toText(property?.definition?.specification),
    },
  }))

  const revitElementIdFromAlt = toText(element?.alternativeIdentifiers?.revitElementId)
  const revitElementId =
    revitElementIdFromAlt ||
    pickProperty(
      properties,
      ["Revit Element ID", "Element Id", "ElementId", "Id"],
      [["revit", "element", "id"], ["element", "id"]]
    )
  const category = pickProperty(
    properties,
    ["Revit Category Type Id", "Category", "Category Name"],
    [["category"]]
  )
  const familyName = pickProperty(properties, ["Family Name", "Family"], [["family"]])
  const elementName = pickProperty(properties, ["Element Name", "Name"], [["element", "name"]]) || toText(element?.name)
  const typeMark = pickProperty(properties, ["Type Mark", "Mark"], [["type", "mark"]])
  const description = pickProperty(properties, ["Description", "Type Description"], [["description"]])
  const model = pickProperty(properties, ["Model", "Model Number", "Modelo"], [["model"]])
  const manufacturer = pickProperty(properties, ["Manufacturer", "Fabricante"], [["manufacturer"], ["fabricante"]])
  const assemblyCode = pickProperty(
    properties,
    ["Assembly Code", "OmniClass Number"],
    [["assembly", "code"], ["omniclass", "number"]]
  )
  const assemblyDescription = pickProperty(
    properties,
    ["Assembly Description", "OmniClass Title"],
    [["assembly", "description"], ["assembly", "desc"], ["omniclass", "title"]]
  )

  const elementId = toText(element?.id)
  const explicitDbId = pickProperty(properties, ["DbId", "dbId", "Db Id"])
  const viewerDbId = toPositiveInt(explicitDbId) || toPositiveInt(element?.dbId) || toPositiveInt(elementId) || null
  const dbId = viewerDbId || explicitDbId || revitElementId || elementId

  const required = [
    revitElementId,
    category,
    familyName,
    elementName,
    typeMark,
    description,
    model,
    manufacturer,
    assemblyCode,
    assemblyDescription,
  ]

  const filled = required.filter((value) => String(value || "").trim() !== "").length
  const total = required.length
  const compliancePct = total > 0 ? Math.round((filled / total) * 100) : 0

  return {
    viewerDbId,
    dbId,
    elementId,
    externalElementId: toText(element?.alternativeIdentifiers?.externalElementId),
    revitElementId,
    category,
    familyName,
    elementName,
    typeMark,
    description,
    model,
    manufacturer,
    assemblyCode,
    assemblyDescription,
    count: 1,
    rawProperties,
    compliance: {
      filled,
      total,
      pct: compliancePct,
    },
  }
}

const singularizeWord = (word) => {
  if (!word) return ""
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`
  if (/sses$/i.test(word)) return word
  if (/s$/i.test(word) && word.length > 3) return word.slice(0, -1)
  return word
}

// FIX: removed the regex guard that blocked multi-word candidates (those with spaces).
// Candidates with spaces will be quoted when building the filter string.
const buildCategoryCandidates = (category) => {
  const raw = String(category || "").trim()
  if (!raw) throw new Error("Missing category")

  const candidates = []
  const pushCandidate = (candidate) => {
    const normalized = String(candidate || "").trim()
    if (!normalized) return
    if (candidates.includes(normalized)) return
    candidates.push(normalized)
  }

  // Always push the raw value first (e.g. "Structural Framing" or "Walls")
  pushCandidate(raw)

  const words = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const compact = words.join("")
  const pascal = words.map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join("")
  const compactSingular = words.map(singularizeWord).join("")
  const pascalSingular = words
    .map((word) => singularizeWord(word))
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join("")

  pushCandidate(compact)
  pushCandidate(pascal)
  pushCandidate(compactSingular)
  pushCandidate(pascalSingular)

  const aliases = CATEGORY_ALIASES[raw] || []
  aliases.forEach(pushCandidate)

  if (!candidates.length) {
    throw new Error(`Invalid category token: ${raw}`)
  }

  return candidates
}

const isFilterSyntaxError = (error) => {
  const message = String(error?.message || "")
  return /Error with query syntax|Lexical error/i.test(message)
}

// FIX: wrap candidates that contain spaces in single quotes so the AEC GraphQL
// filter parser handles them correctly:
//   property.name.category=='Structural Framing'   ✓
//   property.name.category==StructuralFraming       ✓ (no quotes needed)
const quoteIfNeeded = (candidate) => (/\s/.test(candidate) ? `'${candidate}'` : candidate)

const getRowPropertyValue = (row, names = []) => {
  const wanted = (Array.isArray(names) ? names : [names]).map(normalizeKey).filter(Boolean)
  if (!wanted.length) return ""

  const props = Array.isArray(row?.rawProperties) ? row.rawProperties : []
  const hit = props.find((property) => {
    const label = normalizeKey(
      toText(property?.name) || toText(property?.definition?.name) || toText(property?.definition?.description)
    )
    if (!label) return false

    const labelCompact = compactKey(label)
    return wanted.some((name) => {
      const nameCompact = compactKey(name)
      return (
        label === name ||
        labelCompact === nameCompact ||
        label.includes(name) ||
        name.includes(label) ||
        labelCompact.includes(nameCompact) ||
        nameCompact.includes(labelCompact)
      )
    })
  })

  return toText(hit?.value)
}

const isInstanceRow = (row) => {
  const context = normalizeKey(getRowPropertyValue(row, ["Element Context", "Context"]))
  if (!context) return true
  return context.includes("instance")
}

const hasAssemblyData = (row) => Boolean(toText(row?.assemblyCode) || toText(row?.assemblyDescription))

const rowKeyForMatch = (row) => `${normalizeKey(row?.familyName)}|${normalizeKey(row?.elementName)}`

const mergeRowsPreferFilledFields = (base = {}, incoming = {}) => {
  const baseProps = Array.isArray(base?.rawProperties) ? base.rawProperties : []
  const incomingProps = Array.isArray(incoming?.rawProperties) ? incoming.rawProperties : []

  return {
    ...base,
    ...incoming,
    viewerDbId: base?.viewerDbId ?? incoming?.viewerDbId ?? null,
    dbId: toText(base?.dbId) || toText(incoming?.dbId),
    elementId: toText(base?.elementId) || toText(incoming?.elementId),
    externalElementId: toText(base?.externalElementId) || toText(incoming?.externalElementId),
    revitElementId: toText(base?.revitElementId) || toText(incoming?.revitElementId),
    category: toText(base?.category) || toText(incoming?.category),
    familyName: toText(base?.familyName) || toText(incoming?.familyName),
    elementName: toText(base?.elementName) || toText(incoming?.elementName),
    typeMark: toText(base?.typeMark) || toText(incoming?.typeMark),
    description: toText(base?.description) || toText(incoming?.description),
    model: toText(base?.model) || toText(incoming?.model),
    manufacturer: toText(base?.manufacturer) || toText(incoming?.manufacturer),
    assemblyCode: toText(base?.assemblyCode) || toText(incoming?.assemblyCode),
    assemblyDescription: toText(base?.assemblyDescription) || toText(incoming?.assemblyDescription),
    rawProperties: baseProps.length >= incomingProps.length ? baseProps : incomingProps,
    compliance: base?.compliance || incoming?.compliance || null,
    count: Number(base?.count) || Number(incoming?.count) || 1,
  }
}

const dedupeRows = (rows = []) => {
  const byKey = new Map()
  let fallbackIndex = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    const key =
      toText(row?.revitElementId) ||
      toText(row?.externalElementId) ||
      toText(row?.elementId) ||
      toText(row?.dbId) ||
      `fallback-${fallbackIndex + 1}`

    if (!byKey.has(key)) {
      byKey.set(key, row)
      fallbackIndex += 1
      continue
    }

    byKey.set(key, mergeRowsPreferFilledFields(byKey.get(key), row))
  }

  return Array.from(byKey.values())
}

const enrichInstanceRowsFromMixedRows = (rows = []) => {
  const mixedRows = dedupeRows(rows)
  if (!mixedRows.length) return []

  const instances = mixedRows.filter(isInstanceRow)
  const typeRows = mixedRows.filter((row) => !isInstanceRow(row) && hasAssemblyData(row))
  if (!instances.length) return mixedRows.filter(hasAssemblyData)
  if (!typeRows.length) return instances

  const byFamilyAndElement = new Map()
  const byElement = new Map()
  const byFamily = new Map()

  typeRows.forEach((row) => {
    const family = normalizeKey(row?.familyName)
    const element = normalizeKey(row?.elementName)
    const key = rowKeyForMatch(row)
    if (family && element && !byFamilyAndElement.has(key)) byFamilyAndElement.set(key, row)
    if (element && !byElement.has(element)) byElement.set(element, row)
    if (family && !byFamily.has(family)) byFamily.set(family, row)
  })

  return dedupeRows(
    instances.map((instance) => {
      if (hasAssemblyData(instance)) return instance

      const key = rowKeyForMatch(instance)
      const family = normalizeKey(instance?.familyName)
      const element = normalizeKey(instance?.elementName)
      const donor = byFamilyAndElement.get(key) || byElement.get(element) || byFamily.get(family) || null

      if (!donor) return instance
      return mergeRowsPreferFilledFields(instance, donor)
    })
  )
}

const assemblyCoverage = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return 0
  return safeRows.filter(hasAssemblyData).length / safeRows.length
}

const selectBestRows = ({ withContextRows = [], withoutContextRows = [] }) => {
  const withContextInstances = dedupeRows(withContextRows.filter(isInstanceRow))
  const withoutContextEnriched = enrichInstanceRowsFromMixedRows(withoutContextRows)

  if (!withContextInstances.length && !withoutContextEnriched.length) {
    return { rows: [], filterType: "none" }
  }
  if (!withContextInstances.length) {
    return { rows: withoutContextEnriched, filterType: "without_context" }
  }
  if (!withoutContextEnriched.length) {
    return { rows: withContextInstances, filterType: "with_context" }
  }

  const withCoverage = assemblyCoverage(withContextInstances)
  const withoutCoverage = assemblyCoverage(withoutContextEnriched)

  if (withoutCoverage > withCoverage) {
    return { rows: withoutContextEnriched, filterType: "without_context" }
  }

  return { rows: withContextInstances, filterType: "with_context" }
}

const resolveRowsForCategory = async ({ token, modelId, category }) => {
  const candidates = buildCategoryCandidates(category)
  const coverageThreshold = clampCoverageThreshold(WITH_CONTEXT_COVERAGE_THRESHOLD)

  const withContext = (candidate) =>
    `property.name.category==${quoteIfNeeded(candidate)} and ${BULK_CONTEXT_FILTER}`
  const withoutContext = (candidate) =>
    `property.name.category==${quoteIfNeeded(candidate)}`

  let firstSuccessfulEmpty = null
  let lastSyntaxError = null

  for (const candidate of candidates) {
    const withFilter = withContext(candidate)

    let withRows = null

    try {
      withRows = await fetchRowsByPropertyFilter({
        token,
        elementGroupId: modelId,
        propertyFilter: withFilter,
      })
    } catch (error) {
      if (isFilterSyntaxError(error)) {
        lastSyntaxError = error
      } else {
        throw error
      }
    }

    const hasSuccessfulAttempt = Array.isArray(withRows)
    const safeWithRows = Array.isArray(withRows) ? withRows : []
    const withContextInstances = dedupeRows(safeWithRows.filter(isInstanceRow))
    const withCoverage = assemblyCoverage(withContextInstances)

    if (withContextInstances.length > 0 && withCoverage >= coverageThreshold) {
      return {
        rows: withContextInstances,
        resolvedCategoryToken: candidate,
        filterQueryUsed: withFilter,
      }
    }

    const withoutFilter = withoutContext(candidate)
    let withoutRows = null
    try {
      withoutRows = await fetchRowsByPropertyFilter({
        token,
        elementGroupId: modelId,
        propertyFilter: withoutFilter,
      })
    } catch (error) {
      if (isFilterSyntaxError(error)) {
        lastSyntaxError = error
      } else {
        throw error
      }
    }

    const safeWithoutRows = Array.isArray(withoutRows) ? withoutRows : []

    const selection = selectBestRows({
      withContextRows: safeWithRows,
      withoutContextRows: safeWithoutRows,
    })

    if (selection.rows.length > 0) {
      return {
        rows: selection.rows,
        resolvedCategoryToken: candidate,
        filterQueryUsed: selection.filterType === "without_context" ? withoutFilter : withFilter,
      }
    }

    if (hasSuccessfulAttempt && !firstSuccessfulEmpty) {
      firstSuccessfulEmpty = {
        rows: [],
        resolvedCategoryToken: candidate,
        filterQueryUsed: withFilter,
      }
    }
  }

  if (firstSuccessfulEmpty) return firstSuccessfulEmpty

  if (lastSyntaxError) {
    throw new Error(
      `No se pudo construir un filtro valido para category '${category}'. ${lastSyntaxError.message}`
    )
  }

  return {
    rows: [],
    resolvedCategoryToken: null,
    filterQueryUsed: null,
  }
}

const fetchRowsByPropertyFilter = async ({ token, elementGroupId, propertyFilter }) => {
  const modelElementsQuery = `
    query GetElementsFromCategory($elementGroupId: ID!, $propertyFilter: String!, $cursor: String) {
      elementsByElementGroup(
        elementGroupId: $elementGroupId,
        filter: { query: $propertyFilter },
        pagination: { cursor: $cursor, limit: ${ELEMENT_PAGE_LIMIT} }
      ) {
        pagination { cursor pageSize }
        results {
          id
          alternativeIdentifiers {
            revitElementId
            externalElementId
          }
          properties {
            results {
              name
              value
            }
          }
        }
      }
    }
  `

  const rows = []
  let cursor = null

  while (true) {
    const gqlData = await graphQlPost(token, modelElementsQuery, {
      elementGroupId,
      propertyFilter,
      cursor,
    })

    const payload = gqlData?.elementsByElementGroup
    const page = Array.isArray(payload?.results) ? payload.results : []
    if (page.length) rows.push(...page.map(mapElementToRow))

    cursor = payload?.pagination?.cursor || null
    if (!cursor) break
  }

  return rows
}

const fetchElementGroupsByProject = async ({ token, projectId }) => {
  const elementGroupsQuery = `
    query GetElementGroupsByProject($projectId: ID!, $cursor: String) {
      elementGroupsByProject(projectId: $projectId, pagination: { cursor: $cursor }) {
        pagination { pageSize cursor }
        results {
          id
          name
        }
      }
    }
  `

  const allElementGroups = []
  let cursor = null

  while (true) {
    const gqlData = await graphQlPost(token, elementGroupsQuery, {
      projectId,
      cursor,
    })

    const payload = gqlData?.elementGroupsByProject
    const page = Array.isArray(payload?.results) ? payload.results : []
    if (page.length) allElementGroups.push(...page)

    cursor = payload?.pagination?.cursor || null
    if (!cursor) break
  }

  return allElementGroups
}

const fetchElementGroupsByProjectCached = async ({ token, projectId }) => {
  const cacheKey = buildElementGroupsCacheKey(projectId, token)
  const cached = getCachedElementGroups(cacheKey)
  if (cached) return cached

  if (elementGroupsInFlight.has(cacheKey)) {
    return elementGroupsInFlight.get(cacheKey)
  }

  const inFlight = (async () => {
    const groups = await fetchElementGroupsByProject({ token, projectId })
    setCachedElementGroups(cacheKey, groups)
    return groups
  })()

  elementGroupsInFlight.set(cacheKey, inFlight)

  try {
    return await inFlight
  } finally {
    elementGroupsInFlight.delete(cacheKey)
  }
}

async function fetchModelParametersByCategory(token, projectId, modelId, category) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!modelId) throw new Error("Missing modelId")

  const normalizedCategory = String(category || "").trim()
  if (!normalizedCategory) throw new Error("Missing category")

  const allElementGroups = await fetchElementGroupsByProjectCached({
    token,
    projectId,
  })
  const selectedModel = allElementGroups.find((group) => String(group?.id) === String(modelId)) || null

  const resolved = await resolveRowsForCategory({
    token,
    modelId,
    category: normalizedCategory,
  })

  const rows = resolved.rows
  const totalElements = rows.length
  const averageCompliancePct =
    totalElements > 0
      ? Math.round(rows.reduce((acc, row) => acc + (row.compliance?.pct || 0), 0) / totalElements)
      : 0

  return {
    modelId,
    modelName: selectedModel?.name || null,
    category: normalizedCategory,
    resolvedCategoryToken: resolved.resolvedCategoryToken,
    filterQueryUsed: resolved.filterQueryUsed,
    rows,
    propertyDefinitions: [],
    summary: {
      totalElements,
      averageCompliancePct,
      fullyCompliant: rows.filter((row) => (row.compliance?.pct || 0) === 100).length,
    },
  }
}

async function fetchAllModelParameters(token, projectId, modelId) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!modelId) throw new Error("Missing modelId")

  const rows = await fetchRowsByPropertyFilter({
    token,
    elementGroupId: modelId,
    propertyFilter: BULK_CONTEXT_FILTER,
  })

  const totalElements = rows.length
  const averageCompliancePct =
    totalElements > 0
      ? Math.round(rows.reduce((acc, row) => acc + (row.compliance?.pct || 0), 0) / totalElements)
      : 0

  return {
    modelId,
    rows,
    summary: {
      totalElements,
      averageCompliancePct,
      fullyCompliant: rows.filter((row) => (row.compliance?.pct || 0) === 100).length,
    },
  }
}

module.exports = { fetchModelParametersByCategory, fetchAllModelParameters }

const axios = require("axios")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"
const ELEMENT_PAGE_LIMIT = 500
const BULK_CONTEXT_FILTER = "'property.name.Element Context'==Instance"

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

const normalize = (value) => String(value || "").trim().toLowerCase()

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

const pickProperty = (properties, names) => {
  const wanted = (Array.isArray(names) ? names : [names]).map(normalize)
  const hit = (properties || []).find((property) => wanted.includes(normalize(property?.name)))
  return toText(hit?.value)
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

  const gqlErrors = data?.errors
  if (Array.isArray(gqlErrors) && gqlErrors.length) {
    throw new Error(gqlErrors[0]?.message || "AEC GraphQL error")
  }

  return data?.data || {}
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
    revitElementIdFromAlt || pickProperty(properties, ["Revit Element ID", "Element Id", "ElementId", "Id"])
  const category = pickProperty(properties, ["Revit Category Type Id", "Category", "Category Name"])
  const familyName = pickProperty(properties, ["Family Name", "Family"])
  const elementName = pickProperty(properties, ["Element Name", "Name"]) || toText(element?.name)
  const typeMark = pickProperty(properties, ["Type Mark", "Mark"])
  const description = pickProperty(properties, ["Description", "Type Description"])
  const model = pickProperty(properties, ["Model", "Model Number", "Modelo"])
  const manufacturer = pickProperty(properties, ["Manufacturer", "Fabricante"])
  const assemblyCode = pickProperty(properties, ["Assembly Code", "OmniClass Number"])
  const assemblyDescription = pickProperty(properties, ["Assembly Description", "OmniClass Title"])

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

const resolveRowsForCategory = async ({ token, modelId, category }) => {
  const candidates = buildCategoryCandidates(category)

  const withContext = (candidate) =>
    `property.name.category==${quoteIfNeeded(candidate)} and ${BULK_CONTEXT_FILTER}`
  const withoutContext = (candidate) =>
    `property.name.category==${quoteIfNeeded(candidate)}`

  let firstSuccessfulEmpty = null
  let lastSyntaxError = null

  for (const candidate of candidates) {
    const filters = [withContext(candidate), withoutContext(candidate)]

    for (const propertyFilter of filters) {
      try {
        const rows = await fetchRowsByPropertyFilter({
          token,
          elementGroupId: modelId,
          propertyFilter,
        })

        if (rows.length > 0) {
          return { rows, resolvedCategoryToken: candidate, filterQueryUsed: propertyFilter }
        }

        if (!firstSuccessfulEmpty) {
          firstSuccessfulEmpty = {
            rows,
            resolvedCategoryToken: candidate,
            filterQueryUsed: propertyFilter,
          }
        }
      } catch (error) {
        if (isFilterSyntaxError(error)) {
          lastSyntaxError = error
          continue
        }
        throw error
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
          name
          alternativeIdentifiers {
            revitElementId
            externalElementId
          }
          properties {
            results {
              name
              value
              definition {
                id
                name
                description
                specification
              }
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

async function fetchModelParametersByCategory(token, projectId, modelId, category) {
  if (!token) throw new Error("Missing APS access token")
  if (!projectId) throw new Error("Missing projectId")
  if (!modelId) throw new Error("Missing modelId")

  const normalizedCategory = String(category || "").trim()
  if (!normalizedCategory) throw new Error("Missing category")

  const elementGroupsQuery = `
    query GetElementGroupsByProject($projectId: ID!, $cursor: String) {
      elementGroupsByProject(projectId: $projectId, pagination: { cursor: $cursor }) {
        pagination { pageSize cursor }
        results {
          id
          name
          alternativeIdentifiers {
            fileUrn
            fileVersionUrn
          }
          propertyDefinitions {
            results {
              id
              name
              description
              specification
            }
          }
        }
      }
    }
  `

  const allElementGroups = []
  let groupsCursor = null

  while (true) {
    const gqlData = await graphQlPost(token, elementGroupsQuery, {
      projectId,
      cursor: groupsCursor,
    })

    const payload = gqlData?.elementGroupsByProject
    const page = Array.isArray(payload?.results) ? payload.results : []
    if (page.length) allElementGroups.push(...page)

    groupsCursor = payload?.pagination?.cursor || null
    if (!groupsCursor) break
  }

  const selectedModel = allElementGroups.find((group) => String(group?.id) === String(modelId)) || null
  const propertyDefinitions = Array.isArray(selectedModel?.propertyDefinitions?.results)
    ? selectedModel.propertyDefinitions.results
    : []

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
    propertyDefinitions,
    summary: {
      totalElements,
      averageCompliancePct,
      fullyCompliant: rows.filter((row) => (row.compliance?.pct || 0) === 100).length,
    },
  }
}

module.exports = { fetchModelParametersByCategory }
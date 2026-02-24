const axios = require("axios")

const AEC_GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql"

/**
 * Fetch ALL elements (Sheets) handling pagination.
 */
async function fetchSheets(token, elementGroupId, propertyFilter) {
  if (!token) throw new Error("Missing APS access token")
  if (!elementGroupId) throw new Error("Missing elementGroupId")
  if (!propertyFilter) throw new Error("Missing propertyFilter")

  let allResults = [];
  let cursor = null;
  let hasMore = true;


  const query = `
    query GetElementsFromCategory($elementGroupId: ID!, $propertyFilter: String!, $cursor: String) {
      elementsByElementGroup(
        elementGroupId: $elementGroupId,
        filter: { query: $propertyFilter }
        pagination: { cursor: $cursor, limit: 100 }
      ) {
        pagination {
          cursor
          pageSize
        }
        results {
          id
          name
          properties {
            results {
              name
              value
              definition {
                units { name }
              }
            }
          }
        }
      }
    }
  `;

  try {

    while (hasMore) {
      const { data } = await axios.post(
        AEC_GRAPHQL_URL,
        { 
            query, 
            variables: { 
                elementGroupId, 
                propertyFilter,
                cursor: cursor 
            } 
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const gqlErrors = data?.errors;
      if (Array.isArray(gqlErrors) && gqlErrors.length) {
        console.error("GQL Error:", gqlErrors[0]?.message);
        throw new Error(gqlErrors[0]?.message || "AEC GraphQL error");
      }

      const responseData = data?.data?.elementsByElementGroup;
      const pageResults = responseData?.results || [];
   
      allResults = allResults.concat(pageResults);

      const nextCursor = responseData?.pagination?.cursor;
      
      if (nextCursor && pageResults.length > 0) {
          cursor = nextCursor;
      } else {
          hasMore = false;
      }
    }

    return allResults;

  } catch (error) {
    console.error("Error fetching sheets:", error?.response?.data || error?.message || error);
    throw error;
  }
}

module.exports = { fetchSheets }
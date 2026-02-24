const axios = require("axios");

async function fetchAccProjects(token, hubId) {
  if (!token) throw new Error("Missing APS access token");
  if (!hubId) throw new Error("Missing hubId");

  const accountId = String(hubId).replace(/^b\./, "");
  const baseUrl = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/projects`;

  const params = {
    "filter[status]": "active",
    limit: 100,
    offset: 0,
  };

  const headers = { Authorization: `Bearer ${token}` };
  const projects = [];

  while (true) {
    const { data } = await axios.get(baseUrl, { headers, params });

    if (Array.isArray(data?.results)) {
      projects.push(
        ...data.results.map((p) => ({
          id: p.id.startsWith("b.") ? p.id : `b.${p.id}`,
          type: "projects",
          attributes: {
            name: p.name,
            extension: { data: { projectType: p.type, status: p.status } },
          },
        }))
      );
    }

    const nextUrl = data?.pagination?.nextUrl;
    if (!nextUrl) break; 

    try {
      const u = new URL(nextUrl);
      const nextOffset = u.searchParams.get("offset");
      const nextLimit = u.searchParams.get("limit");
      if (nextLimit) params.limit = Number(nextLimit);
      params.offset = nextOffset ? Number(nextOffset) : params.offset + params.limit;
    } catch {
      params.offset += params.limit;
    }
  }

  return projects;
}

module.exports = { fetchAccProjects };

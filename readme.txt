ABT_BIM - Technical README
==========================

1) Project Overview
-------------------
ABT_BIM is a full-stack web application for Autodesk BIM workflows.
It currently includes two core modules:
- Model Parameter Checker (BIM data quality validation).
- Project Construction Traking / WBS Planner (WBS import, model-WBS matching, 4D playback, dashboards).

Tech stack:
- Frontend: React + Vite + Tailwind + Radix UI.
- Backend: Node.js + Express + Knex + MySQL.
- Viewer: Autodesk Viewer (APS/Forge).


2) Repository Structure
-----------------------
- packages/frontend
  - src/pages/AEC_Model
    - AEC_Model_Parameter_Checker.jsx
    - AEC_Project_WBS_Planner.jsx
  - src/components/aec_model_components
    - ParameterComplianceTable.jsx
    - ProjectParameterComplianceTable.jsx
    - WBSPlannerTable.jsx
  - src/utils/viewers
    - simpleViewer.js

- packages/backend
  - app.js
  - server.js
  - migrations/
  - resources/controllers/
  - resources/routers/
  - utils/


3) Local Setup
--------------
Prerequisites:
- Node.js 18+
- MySQL 8+

Install dependencies:
- npm install

Run frontend:
- npm run dev:frontend

Run backend:
- npm run dev:backend

Run backend migrations:
- npm --workspace packages/backend run migrate:latest


4) Core Functional Flows
------------------------
4.1 Model Parameter Checker
- User selects a model.
- Frontend requests the latest discipline previously analyzed for that model.
- Frontend loads latest saved checks by category for the selected discipline.
- User runs discipline analysis.
- Backend fetches category rows from Autodesk GraphQL and saves each category check.
- Backend persists:
  - parameter_checks (run metadata)
  - parameter_elements (element-level detail)
- Backend updates rollups for project/model/discipline compliance.
- Frontend supports two view modes:
  - Checker
  - Project Parameter Compliance

4.2 WBS Planner
- User uploads Excel with WBS rows.
- Frontend parses rows up to level 4 and persists WBS set.
- User selects model and runs model-WBS matching.
- Matching uses assembly_code as primary key and assembly_description similarity as fallback.
- Resulting match is used by Viewer + Table mode for timeline isolation/4D playback.
- Additional view modes:
  - Table WBS
  - Viewer + Table
  - Dashboard
  - Gant


5) Main API Endpoints (AEC Router)
----------------------------------
Model parameter checker:
- GET    /aec/:projectId/graphql-model-parameters
- POST   /aec/:projectId/parameters/save-check
- GET    /aec/:projectId/parameters/last-check
- GET    /aec/:projectId/parameters/last-discipline
- GET    /aec/:projectId/parameters/project-compliance

WBS planner:
- POST   /aec/:projectId/wbs/save
- GET    /aec/:projectId/wbs/latest
- POST   /aec/:projectId/wbs/match/run
- GET    /aec/:projectId/wbs/match/latest

Model selection:
- POST   /aec/:projectId/graphql-models/set-selection
- GET    /aec/:projectId/graphql-models/get-selection


6) Database Tables (Current Core)
---------------------------------
Parameter checker:
- parameter_checks
- parameter_elements
- parameter_project_compliance_rollups
- parameter_project_compliance_totals

WBS planner:
- wbs_sets
- wbs_items
- wbs_model_bindings
- wbs_match_runs
- wbs_element_matches

Other:
- model_selection


7) QA and Code Quality Standards
--------------------------------
- Do not change behavior while doing style/cleanup-only tasks.
- Keep comments minimal, high-value, and in English.
- Keep logging policy strict:
  - No active console.log in production code paths.
  - Prefer controlled errors/warnings only where operationally needed.
- Preserve backward-compatible API contracts unless explicitly versioned.
- Validate changes with:
  - node --check for backend JS files.
  - eslint on modified frontend files.
  - frontend build before merge.


8) Frontend UX Notes (Current Direction)
----------------------------------------
- The color palette and visual order are coherent and readable.
- Priority actions should stay grouped at top-level containers.
- Viewer + table split is appropriate for operational workflows.
- Ensure all large tables remain inside scrollable containers to avoid layout shifts.
- Keep KPI cards concise and place mode toggles above complex content.


9) Operational Notes
--------------------
- JSON body limit is controlled by JSON_BODY_LIMIT (default 15mb).
- Rollup tables are used for fast compliance summaries; fallback query path exists.
- Autodesk Viewer URN normalization is handled in frontend viewer utilities.


10) Recommended Next Steps
--------------------------
- Add automated unit tests for matching and compliance aggregation logic.
- Add integration tests for the parameter save-check and compliance summary endpoints.
- Introduce a centralized logger abstraction for backend diagnostics.
- Add CI checks for lint + build + migration validation.

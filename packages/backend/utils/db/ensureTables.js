// utils/db/ensureTables.js

let ensured = false;
let ensuringPromise = null;

async function ensureTables(knex) {
  if (ensured) return;
  if (ensuringPromise) return ensuringPromise;

  ensuringPromise = (async () => {
    await ensureUserPlansTable(knex);
    await ensureModelSelectionTable(knex);
    await ensurePlanFolderSelectionTable(knex);
    await ensurePlanAlertsTable(knex);

    ensured = true;
  })().finally(() => {
    ensuringPromise = null;
  });

  return ensuringPromise;
}

// -------------------- USER PLANS --------------------

async function ensureUserPlansTable(knex) {
  const exists = await knex.schema.hasTable("user_plans");
  if (!exists) {
    await knex.schema.createTable("user_plans", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("name").defaultTo("");
      t.string("number").nullable().index();

      t.date("planned_gen_date");
      t.date("actual_gen_date");
      t.date("planned_review_date");
      t.date("actual_review_date");
      t.date("planned_issue_date");
      t.date("actual_issue_date");

      t.string("current_revision").defaultTo("");
      t.date("current_revision_date");
      t.string("status").defaultTo("");

      t.integer("has_approval_flow").notNullable().defaultTo(0);

      t.date("docs_last_modified");
      t.integer("docs_version_number");
      t.date("latest_review_date");
      t.string("latest_review_status");
      t.date("sheet_updated_at");
      t.string("sheet_version_set");

      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
    return;
  }

  await ensureUserPlansColumns(knex);
}

async function ensureUserPlansColumns(knex) {
  const exists = await knex.schema.hasTable("user_plans");
  if (!exists) return;

  const columnInfo = await knex("user_plans").columnInfo();
  const has = (name) => Object.prototype.hasOwnProperty.call(columnInfo, name);

  const addColumn = async (name, addFn) => {
    if (has(name)) return;
    await knex.schema.alterTable("user_plans", addFn);
  };

  await addColumn("has_approval_flow", (t) => t.integer("has_approval_flow").notNullable().defaultTo(0));
  await addColumn("docs_last_modified", (t) => t.date("docs_last_modified"));
  await addColumn("docs_version_number", (t) => t.integer("docs_version_number"));
  await addColumn("latest_review_date", (t) => t.date("latest_review_date"));
  await addColumn("latest_review_status", (t) => t.string("latest_review_status"));
  await addColumn("sheet_updated_at", (t) => t.date("sheet_updated_at"));
  await addColumn("sheet_version_set", (t) => t.string("sheet_version_set"));

  await addColumn("created_at", (t) => t.timestamp("created_at").nullable());
  await addColumn("updated_at", (t) => t.timestamp("updated_at").nullable());
}

// -------------------- MODEL SELECTION --------------------

async function ensureModelSelectionTable(knex) {
  const exists = await knex.schema.hasTable("model_selection");
  if (!exists) {
    await knex.schema.createTable("model_selection", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").notNullable();
      t.string("model_name").nullable();

      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["project_id", "model_id"]);
    });
    return;
  }

  await ensureModelSelectionColumns(knex);
}

async function ensureModelSelectionColumns(knex) {
  const exists = await knex.schema.hasTable("model_selection");
  if (!exists) return;

  const columnInfo = await knex("model_selection").columnInfo();
  const has = (name) => Object.prototype.hasOwnProperty.call(columnInfo, name);

  const addColumn = async (name, addFn) => {
    if (has(name)) return;
    await knex.schema.alterTable("model_selection", addFn);
  };

  await addColumn("model_name", (t) => t.string("model_name").nullable());
  await addColumn("created_at", (t) => t.timestamp("created_at").nullable());
  await addColumn("updated_at", (t) => t.timestamp("updated_at").nullable());
}

// -------------------- FOLDER SELECTION --------------------

async function ensurePlanFolderSelectionTable(knex) {
  const exists = await knex.schema.hasTable("plan_folder_selection");
  if (exists) return;

  await knex.schema.createTable("plan_folder_selection", (t) => {
    t.increments("id").primary();
    t.string("project_id").notNullable().unique();
    t.string("folder_id").notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

// -------------------- PLAN ALERTS --------------------

async function ensurePlanAlertsTable(knex) {
  const exists = await knex.schema.hasTable("plan_alerts");
  if (exists) return;

  await knex.schema.createTable("plan_alerts", (t) => {
    t.increments("id").primary();
    t.string("project_id").notNullable().index();
    t.string("source").notNullable().defaultTo("MODEL");

    t.string("sheet_key").notNullable();
    t.string("sheet_number");
    t.string("sheet_name");
    t.string("current_revision");
    t.string("current_revision_date");
    t.text("model_ids");

    t.timestamp("detected_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.unique(["project_id", "source", "sheet_key"]);
  });
}

module.exports = { ensureTables };

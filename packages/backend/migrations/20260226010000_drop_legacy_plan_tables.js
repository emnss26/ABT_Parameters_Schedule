/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists("plan_alerts");
  await knex.schema.dropTableIfExists("plan_folder_selection");
  await knex.schema.dropTableIfExists("user_plans");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasUserPlans = await knex.schema.hasTable("user_plans");
  if (!hasUserPlans) {
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
  }

  const hasPlanFolderSelection = await knex.schema.hasTable("plan_folder_selection");
  if (!hasPlanFolderSelection) {
    await knex.schema.createTable("plan_folder_selection", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().unique();
      t.string("folder_id").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  const hasPlanAlerts = await knex.schema.hasTable("plan_alerts");
  if (!hasPlanAlerts) {
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
};

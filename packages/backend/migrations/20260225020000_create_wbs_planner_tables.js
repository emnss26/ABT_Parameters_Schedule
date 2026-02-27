/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasWbsSets = await knex.schema.hasTable("wbs_sets");
  if (!hasWbsSets) {
    await knex.schema.createTable("wbs_sets", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").nullable().index();
      t.string("name").notNullable().defaultTo("WBS Import");
      t.string("source_file_name").nullable();
      t.string("status").notNullable().defaultTo("active");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["project_id", "model_id", "id"], "idx_wbs_sets_lookup");
    });
  }

  const hasWbsItems = await knex.schema.hasTable("wbs_items");
  if (!hasWbsItems) {
    await knex.schema.createTable("wbs_items", (t) => {
      t.increments("id").primary();
      t
        .integer("wbs_set_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("wbs_sets")
        .onDelete("CASCADE");

      t.string("wbs_code").notNullable();
      t.string("title").notNullable();
      t.integer("level").notNullable();
      t.string("parent_code").nullable();
      t.date("start_date").nullable();
      t.date("end_date").nullable();
      t.string("duration_label").nullable();

      // Reserved fields for next phase (planned vs actual + cost).
      t.date("baseline_start_date").nullable();
      t.date("baseline_end_date").nullable();
      t.date("actual_start_date").nullable();
      t.date("actual_end_date").nullable();
      t.decimal("actual_progress_pct", 5, 2).nullable();
      t.decimal("planned_cost", 18, 2).nullable();
      t.decimal("actual_cost", 18, 2).nullable();

      t.json("extra_props").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["wbs_set_id", "wbs_code"], "uq_wbs_items_set_code");
      t.index(["wbs_set_id", "level"], "idx_wbs_items_set_level");
    });
  }

  const hasWbsModelBindings = await knex.schema.hasTable("wbs_model_bindings");
  if (!hasWbsModelBindings) {
    await knex.schema.createTable("wbs_model_bindings", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").notNullable();
      t
        .integer("wbs_set_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("wbs_sets")
        .onDelete("CASCADE");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["project_id", "model_id"], "uq_wbs_model_bindings_project_model");
      t.index(["wbs_set_id"], "idx_wbs_model_bindings_set");
    });
  }

  const hasWbsMatchRuns = await knex.schema.hasTable("wbs_match_runs");
  if (!hasWbsMatchRuns) {
    await knex.schema.createTable("wbs_match_runs", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").notNullable().index();
      t
        .integer("wbs_set_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("wbs_sets")
        .onDelete("CASCADE");
      t.string("status").notNullable().defaultTo("completed");
      t.integer("total_elements").notNullable().defaultTo(0);
      t.integer("matched_elements").notNullable().defaultTo(0);
      t.integer("unmatched_elements").notNullable().defaultTo(0);
      t.integer("ambiguous_elements").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["project_id", "model_id", "wbs_set_id", "id"], "idx_wbs_match_runs_lookup");
    });
  }

  const hasWbsElementMatches = await knex.schema.hasTable("wbs_element_matches");
  if (!hasWbsElementMatches) {
    await knex.schema.createTable("wbs_element_matches", (t) => {
      t.increments("id").primary();
      t
        .integer("run_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("wbs_match_runs")
        .onDelete("CASCADE");

      t.string("revit_element_id").nullable().index();
      t.integer("viewer_db_id").unsigned().nullable().index();

      t.string("category").nullable();
      t.string("family_name").nullable();
      t.string("element_name").nullable();
      t.string("assembly_code").nullable().index();
      t.text("assembly_description").nullable();

      t.string("matched_wbs_code").nullable().index();
      t.string("match_basis").nullable(); // code_exact | description_similarity | none | ambiguous
      t.string("match_status").notNullable().defaultTo("unmatched"); // matched | unmatched | ambiguous
      t.decimal("match_score", 6, 3).nullable();

      t.integer("check_id").unsigned().nullable();
      t.integer("check_element_id").unsigned().nullable();

      t.date("start_date").nullable();
      t.date("end_date").nullable();
      t.decimal("planned_cost", 18, 2).nullable();
      t.decimal("actual_cost", 18, 2).nullable();

      t.json("extra_props").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["run_id", "match_status"], "idx_wbs_element_matches_run_status");
      t.index(["run_id", "matched_wbs_code"], "idx_wbs_element_matches_run_code");
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("wbs_element_matches");
  await knex.schema.dropTableIfExists("wbs_match_runs");
  await knex.schema.dropTableIfExists("wbs_model_bindings");
  await knex.schema.dropTableIfExists("wbs_items");
  await knex.schema.dropTableIfExists("wbs_sets");
};

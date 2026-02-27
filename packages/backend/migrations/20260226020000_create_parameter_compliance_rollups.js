/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasRollups = await knex.schema.hasTable("parameter_project_compliance_rollups");
  if (!hasRollups) {
    await knex.schema.createTable("parameter_project_compliance_rollups", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").notNullable().index();
      t.string("discipline_id").notNullable();
      t.integer("total_elements").notNullable().defaultTo(0);
      t.integer("fully_compliant").notNullable().defaultTo(0);
      t.integer("average_compliance_pct").notNullable().defaultTo(0);
      t.integer("latest_check_id").unsigned().nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(
        ["project_id", "model_id", "discipline_id"],
        "uq_parameter_project_compliance_rollups_project_model_discipline"
      );
      t.index(
        ["project_id", "model_id", "discipline_id", "latest_check_id"],
        "idx_parameter_project_compliance_rollups_lookup"
      );
    });
  }

  const hasTotals = await knex.schema.hasTable("parameter_project_compliance_totals");
  if (!hasTotals) {
    await knex.schema.createTable("parameter_project_compliance_totals", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().unique();
      t.integer("total_elements").notNullable().defaultTo(0);
      t.integer("fully_compliant").notNullable().defaultTo(0);
      t.integer("average_compliance_pct").notNullable().defaultTo(0);
      t.integer("analyzed_models").notNullable().defaultTo(0);
      t.integer("analyzed_disciplines").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["project_id", "updated_at"], "idx_parameter_project_compliance_totals_lookup");
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("parameter_project_compliance_totals");
  await knex.schema.dropTableIfExists("parameter_project_compliance_rollups");
};

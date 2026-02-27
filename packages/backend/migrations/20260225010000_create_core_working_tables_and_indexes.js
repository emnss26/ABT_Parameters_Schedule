/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasModelSelection = await knex.schema.hasTable("model_selection");
  if (!hasModelSelection) {
    await knex.schema.createTable("model_selection", (t) => {
      t.increments("id").primary();
      t.string("project_id").notNullable().index();
      t.string("model_id").notNullable();
      t.string("model_name").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["project_id", "model_id"]);
    });
  }

  const hasParameterChecks = await knex.schema.hasTable("parameter_checks");
  if (hasParameterChecks) {
    try {
      await knex.raw(
        "CREATE INDEX idx_parameter_checks_lookup ON parameter_checks (project_id(64), model_id(64), discipline_id(64), category_id(64), id)"
      );
    } catch (err) {
      if (!/Duplicate key name|already exists/i.test(String(err && err.message))) {
        throw err;
      }
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasParameterChecks = await knex.schema.hasTable("parameter_checks");
  if (hasParameterChecks) {
    try {
      await knex.raw("DROP INDEX idx_parameter_checks_lookup ON parameter_checks");
    } catch (err) {
      if (!/check that column\/key exists|Can't DROP|doesn't exist/i.test(String(err && err.message))) {
        throw err;
      }
    }
  }

  await knex.schema.dropTableIfExists("model_selection");
};

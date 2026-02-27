/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema
    // Master table: stores each analysis execution metadata.
    .createTable("parameter_checks", (table) => {
      table.increments("id").primary();
      table.string("project_id").notNullable().index();
      table.string("model_id").notNullable().index();
      table.string("discipline_id").notNullable();
      table.string("category_id").notNullable();
      table.string("status").defaultTo("completed");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })

    // Detail table: stores the analyzed element rows.
    .createTable("parameter_elements", (table) => {
      table.increments("id").primary();
      table
        .integer("check_id")
        .unsigned()
        .references("id")
        .inTable("parameter_checks")
        .onDelete("CASCADE");

      table.string("revit_element_id").index();
      table.string("category");
      table.string("family_name");
      table.string("element_name");
      table.string("type_mark");
      table.text("description");
      table.string("model_param");
      table.string("manufacturer");
      table.string("assembly_code");
      table.text("assembly_description");
      table.integer("count").defaultTo(1);
      table.string("compliance");
      table.json("extra_props").nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("parameter_elements").dropTableIfExists("parameter_checks");
};

exports.up = async function (knex) {
  const hasCol = async (name) => {
    const info = await knex.raw("PRAGMA table_info('user_plans')");
    const rows = Array.isArray(info) ? (info[0] || info) : info;
    const cols = rows.map((r) => r.name);
    return cols.includes(name);
  };

  await knex.schema.alterTable("user_plans", async (table) => {
    if (!(await hasCol("has_approval_flow"))) {
      table.integer("has_approval_flow").notNullable().defaultTo(0);
    }
    if (!(await hasCol("actual_review_date"))) {
      // ISO YYYY-MM-DD cabe en 10 chars; usa TEXT por simplicidad en SQLite
      table.string("actual_review_date", 10).nullable();
    }
    // Si no existiera "status" y lo quieres persistir, descomenta:
    // if (!(await hasCol("status"))) {
    //   table.string("status").nullable();
    // }
  });
};

exports.down = async function (knex) {
  // En SQLite, dropColumn puede recrear la tabla internamente.
  await knex.schema.alterTable("user_plans", (table) => {
    table.dropColumn("has_approval_flow");
    table.dropColumn("actual_review_date");
    // table.dropColumn("status");
  });
};
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('user_plans');
  if (exists) return;

  await knex.schema.createTable('user_plans', (t) => {
    t.increments('id').primary();
    t.string('project_id').notNullable().index();
    t.string('name').defaultTo('');
    t.string('number').nullable(); // <— puede ser null mientras el usuario no lo llene

    // Fechas programadas
    t.date('planned_gen_date').nullable();
    t.date('planned_review_date').nullable();
    t.date('planned_issue_date').nullable();

    // Fechas reales
    t.date('actual_gen_date').nullable();
    t.date('actual_review_date').nullable();
    t.date('actual_issue_date').nullable();

    // Revisión actual (AEC)
    t.string('current_revision').defaultTo('');
    t.date('current_revision_date').nullable();

    // Estatus general
    t.string('status').defaultTo('');

    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Unicidad por proyecto+numero (permite múltiples NULL en SQLite)
  await knex.schema.alterTable('user_plans', (t) => {
    t.unique(['project_id', 'number']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('user_plans');
};
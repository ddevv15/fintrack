# Migrations

The database schema lives here as plain numbered `.sql` files. There is no ORM,
so this directory is the only description of the schema, and it is the one to
read when you want to know what a table looks like.

Create one:

    npx @insforge/cli db migrations new <name>

Apply everything not yet applied:

    npx @insforge/cli db migrations up --all

Two things spec 0001 asks of every migration that touches personal data:

- Row level security is switched on, with a policy tied to the signed in user
  id. A table with no policy is a data leak, not a to do.
- Aggregate functions stay `SECURITY INVOKER`, the Postgres default, so those
  policies still apply to whoever calls them.

Migrations are applied before the code that reads them is deployed. Add a column
first, then ship the code that uses it. Drop a column only once nothing reads it.

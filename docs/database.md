# Database plan

The app currently runs from browser `localStorage`. We are introducing a local SQLite database so we can keep:

- stable buildings and units
- active tenants and vacated tenant history
- payments
- month-specific overrides
- explicit row order per building and month

## Database file

Default path:

`db/tatra.sqlite`

## Core tables

- `buildings`: building metadata
- `units`: one stable row per building/unit/floor slot
- `tenancies`: active and archived tenant history
- `unit_vacancy_state`: vacancy-side metadata for a unit
- `payments`: rent, due, and advance payments
- `tenant_month_overrides`: actual rent, paid, carry, notes, and identity overrides by month
- `unit_row_order`: explicit row order snapshots by building and month
- `activity_log`: imported activity history

## Why this structure

The current app mixes row identity with tenant identity. That is what keeps causing:

- duplicate vacant rows
- rows jumping when unit or floor changes
- hidden stale rows
- hard-to-recover saved state

The database model separates:

- `unit` as the stable row
- `tenancy` as the occupant history

That lets us keep row order stable even when tenant data changes.

## Scripts

- `npm run db:init`
  - creates the SQLite database and schema
- `npm run db:import-state -- <path-to-state-json>`
  - imports a JSON export of the current app state into the database
- `npm run db:export-snapshot`
  - exports a browser-readable snapshot to `src/data/db-state.generated.js`

## Current migration step

This change does **not** switch the UI to the database yet.

It adds:

1. the schema
2. the database bootstrap
3. a migration/import script for a JSON dump of the app state
4. a generated DB snapshot file that the browser can read without direct SQLite access

## Next step

Build a database-backed repository layer for:

- buildings
- units
- active tenancy by unit
- row order by month

Then point page 2 and page 3 at that repository instead of raw `localStorage`.

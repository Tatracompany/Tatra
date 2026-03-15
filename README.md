# Tatra Reset

This is the clean restart of the landlord dashboard from `C:\Users\Y PC\Desktop\test`.

What is preserved:
- The current visual design and page structure.
- Building, tenant, and payment seed data.
- The existing modular source files from `src/app`.

What is cleaner now:
- Source files live in `src/app` and `src/data`.
- Generated runtime files are rebuilt with `npm run build`.
- The project no longer treats the generated root bundle as the source of truth.

Suggested workflow:
1. Run `npm start` to build and open the fresh app locally.
2. Use the sidebar working-month control to start from January 2026 and move forward month by month.
3. Run `npm run build` after source changes if you are not using `npm start`.

Online deployment:
1. Push this repo to GitHub.
2. Create a new Render Blueprint from the repo.
3. Render will create a managed PostgreSQL database named `tatra-db`.
4. The web service reads `DATABASE_URL` from that database automatically.
5. Set `APP_USERNAME` and `APP_PASSWORD` in Render only if you want basic auth on the public URL.
6. Open the deployed URL and use it normally from any device.

Notes:
- The live source of truth should be PostgreSQL.
- The generated `db-state.generated.js` file is only a fallback snapshot.
- To move existing data from SQLite into PostgreSQL, run:
  - `npm run db:migrate-postgres`
  - with `DATABASE_URL` set to the target Postgres connection string.

Online DB backup to this computer:
1. Use database-level Postgres backups from Render for the online database.
2. Keep GitHub as the backup for code.
3. If you still want a local export file, run `npm run db:export-snapshot`.

Online DB restore from this computer:
1. Restore the Render Postgres database from Render backups, or re-run the SQLite-to-Postgres migration into a fresh Postgres instance if needed.

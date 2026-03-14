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
3. Keep the persistent disk enabled so SQLite lives at `/var/data/tatra.sqlite`.
4. Set `APP_USERNAME` and `APP_PASSWORD` in Render so the public URL is protected.
5. Open the deployed URL and use it normally from any device.

Notes:
- The live source of truth remains SQLite.
- The generated `db-state.generated.js` file is only a fallback snapshot.
- On first deploy, if `/var/data/tatra.sqlite` does not exist yet, the app copies the bundled `db/tatra.sqlite` into the persistent disk automatically.

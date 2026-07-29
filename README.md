# Fieldwork Discover

An inventory-aware recommendation workspace. Angular supports search, categories, budgets and saved products. Java serves the canonical catalog and applies hard filters. Go ranks descriptions with TF IDF cosine similarity and a saved-item profile.

## Run locally

Open this folder in Cursor or open the parent Fieldwork.code-workspace.

### Docker

Start Docker Desktop, then run `docker compose up --build` from this folder. Open http://localhost:8082.

### Native development

Requires Go 1.26 or newer, Java 21, Maven 3.9 and Node.js 22.22 or newer.

Terminal 1:

```powershell
cd ranker
go run .
```

Terminal 2:

```powershell
cd api
mvn -B package
.\start-api.ps1
```

On this Windows machine, Java needed a short socket directory. If Maven tests report a loopback initialization error, create api/.java-tmp and set JAVA_TOOL_OPTIONS to `-Djdk.net.unixdomain.tmpdir="C:\Users\Swarneil Pradhan\Project\recommendation-studio\api\.java-tmp"` before running Maven. The startup script sets this option for the API itself.

Terminal 3:

```powershell
cd frontend
npm ci
npm start
```

Open http://localhost:4202. The initial catalog contains eight fictional products, including one out-of-stock fixture that is never returned to the interface. Product illustrations are original SVGs. No checkout or external live commerce source is connected.

## How ranking works

Go builds TF IDF vectors from product descriptions and compares them with the query. A saved-item profile contributes 25% when there is a query, or supplies the ranking when the query is empty. Stable item IDs break ties. Scores are similarity values, not probabilities.

The ranking cache expires after 30 seconds and contains at most 256 entries. Its key includes the complete ranking input. Java reloads api/catalog.json on each request and applies stock, budget, category and saved-only filters. Failed ranking returns an explicit 503. Update catalog.json atomically if editing inventory while the service runs.

Saved IDs stay in browser localStorage. They are sent to the local API to build the ranking profile. There is no account, purchase or tracking service.

## Tests

```powershell
cd ranker
go test ./...
cd ../api
mvn test
cd ../frontend
npm run build
```

Optional HTTP integration checks, with both backends running: `python -m pip install pytest httpx`, then `python -m pytest tests -q` from the project root.

Verified locally: 5 Go tests, 5 Java tests, 4 HTTP integration tests and the production frontend build. Browser checks verified ranking, saving an item, product detail dialogs and Escape dismissal with focus restoration. Docker Compose configuration validates; container image builds await a running Docker daemon.

## Code map

* api/src/main/java/dev/fieldwork/CatalogServer.java: bounded HTTP service, catalog validation and stock filters.
* api/catalog.json: fictional sample inventory.
* ranker/main.go: ranking and TTL cache.
* frontend/src/discover.ts: search, filters, local saved IDs and native dialog.
* docs/: architecture, research provenance and REA evidence.
* .github/workflows/ci.yml: verification only.

Railway deployment remains deferred. Public hosting requires authentication and shared operational controls described in docs/architecture.md.

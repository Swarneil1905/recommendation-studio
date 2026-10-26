# Recommendation Studio

Explore how search terms, inventory rules and product preferences affect a recommendation list. Browse an illustrated example catalog, import your own inventory, compare rankings and export the results.

[Open the app](https://recommendation-studio-production.up.railway.app) · [GitHub Actions](https://github.com/Swarneil1905/recommendation-studio/actions) · [MIT license](LICENSE)

## Watch the walkthrough

[![Recommendation Studio walkthrough: search products, add a preference and compare rankings](docs/assets/walkthrough.gif)](docs/assets/walkthrough.mp4)

[Watch or download the full video](docs/assets/walkthrough.mp4) (00:00:27.76) · [View a still screenshot](docs/assets/preview.png). This silent recording shows the live catalog, preference selection, ranking comparison and JSON export.

## Try it in a minute

1. Choose a collection on the homepage and open the catalog workspace.
2. Search for a use case, then narrow the results by category or budget.
3. Add a product to your preference profile.
4. Enable the ranking comparison to see its position against the query only baseline.
5. Switch between cards and table views, inspect a product or export the results.

The supplied catalog contains eight fictional products with generated product imagery. One product is out of stock so you can inspect inventory filtering. It is a recommendation workbench with no checkout or external commerce feed.

## Current capabilities

| Feature | Behavior |
| --- | --- |
| Catalog search | Description matching with category, budget and stock constraints |
| Preference profile | Up to 25 products used to personalize the ranking |
| Ranking comparison | Compare personalized positions against the same query without preferences |
| Catalog import | Validate up to 500 products from a JSON file without replacing shared inventory |
| Results export | Download the current results and preference profile as JSON |

Ranking uses TF IDF and cosine similarity, with no paid AI API. Similarity is a relevance measure, not a probability. Imported products use a generic illustration when no built in product image is available.

## How it works

```text
Angular interface → Java catalog API → Go ranking service
                         ↓                    ↓
                   catalog.json         30 second cache
```

| Component | Responsibility |
| --- | --- |
| Angular | Catalog imports, search filters, ranking comparison and result inspection |
| Java 21 | Catalog validation, inventory rules and HTTP API |
| Go | TF IDF ranking, saved product profiles and bounded result caching |
| Nginx | Frontend hosting and API proxy in Docker |

The Go service compares TF IDF vectors using cosine similarity. When a query and saved products are present, the query contributes 75% and the saved product profile contributes 25%. Without a query, the saved profile supplies the ranking. Stable product IDs break ties; similarity scores are not probabilities.

The cache holds at most 256 entries with a 30 second TTL and keys the complete ranking input. Java reloads the catalog on each request and applies stock, category, budget and saved item filters. A failed ranking request returns an explicit HTTP 503.

## Quick start with Docker

Requires Docker Desktop or Docker Engine with Compose. From the repository root:

```sh
docker compose up --build
```

Open **http://localhost:8082**. Try a descriptive search, save a product, then compare the results. Stop the stack with `docker compose down`.

## Run without Docker

Requires Go 1.26+, Java 21, Maven 3.9+ and Node.js 22.22+. Start each service in its own terminal from the repository root.

**Ranking service:**

```sh
cd ranker
go run .
```

**Catalog API on Windows:**

```powershell
cd api
mvn -B package
.\start-api.ps1
```

On macOS or Linux, replace the startup script with `java -jar target/catalog-api-1.0.0.jar`, keeping `api` as the working directory.

**Frontend:**

```sh
cd frontend
npm ci
npm start
```

Open **http://localhost:4202**. The Java API listens on port **8002** and the Go service on **8090**.

### Windows Java socket workaround

If Maven reports a loopback initialization error caused by a long temporary path, run the following from `api`, then retry the build:

```powershell
New-Item -ItemType Directory -Force .java-tmp | Out-Null
$socketDirectory = (Resolve-Path .java-tmp).Path
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir="' + $socketDirectory + '"'
mvn -B package
```

The startup script configures this directory for the API process automatically.

## Configuration and data

| Variable | Default | Purpose |
| --- | --- | --- |
| `CATALOG_PATH` | `catalog.json` | Catalog file, relative to the Java process working directory |
| `RANKER_URL` | `http://127.0.0.1:8090` | Go ranking service address |
| `PORT` | `8002` | Java API port |
| `BIND_ADDRESS` | `127.0.0.1` | Java API bind address |

Edit [`api/catalog.json`](api/catalog.json) to change the sample inventory. Replace it atomically if the API is running, so requests do not read a partially written file.

The preference profile and imported catalog live in the current page session and are sent to the API when building recommendations. Reloading the page clears them. Export results before leaving if you need a record. No purchase history or external tracking service is connected.

## Development checks

```sh
cd ranker
go test ./...
cd ../api
mvn test
cd ../frontend
npm run build
```

For HTTP integration checks, start both backend services and run from the repository root:

```sh
python -m pip install pytest httpx
python -m pytest tests -q
```

Tests cover ranking behavior, cache expiry, duplicate IDs, catalog filtering and the HTTP integration. GitHub Actions runs the Go and Java tests, frontend build and container builds. See the [verification notes](docs/verification.md) for the recorded browser checks and local results.

## Repository guide

| Path | Contents |
| --- | --- |
| `frontend/src/discover.ts` | Search, saved products and detail dialogs |
| `api/src/main/java/dev/swarneil/recommendation/CatalogServer.java` | Catalog service and inventory filters |
| `api/catalog.json` | Fictional sample inventory |
| `ranker/main.go` | Ranking implementation and TTL cache |
| `tests/` | HTTP integration checks |
| `docs/` | Architecture and verification details |

The public demo uses a rate limited gateway and a single replica. See [deployment and operations](docs/deployment.md) for CI/CD, resource limits and rollback. The catalog remains fictional sample inventory.

## Deployment and availability

The homepage is at `/`; the product workspace is at `/workspace`. The public Railway service uses sleep mode to reduce idle hosting costs. The first visit after inactivity can take longer while the service starts. Public requests are rate limited.

GitHub Actions checks frontend and backend code, builds the containers, tests the public HTTP path, and verifies both process failure handling and a clean Docker shutdown. Only a verified current `main` commit is promoted to the `production` branch that Railway deploys. A normal platform stop exits successfully; an unexpected required process exit fails the container.

See [deployment and operations](docs/deployment.md) for configuration and rollback, and [architecture](docs/architecture.md) for the service boundaries.

## License

Original project code is licensed under the [MIT License](LICENSE), copyright © 2026 Swarneil Pradhan. Bundled fonts retain their SIL Open Font Licenses in [`frontend/public/fonts`](frontend/public/fonts). Third party dependencies retain their respective licenses.

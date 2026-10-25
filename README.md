# Recommendation Studio

Explore a product catalog with natural language search, inventory filters and recommendations informed by your saved products.

[Live demo](https://recommendation-studio-production.up.railway.app) · [CI](https://github.com/Swarneil1905/recommendation-studio/actions) · [Architecture](docs/architecture.md) · [Verification notes](docs/verification.md) · [MIT license](LICENSE)

## What you can do

- Search product descriptions and browse by category or budget.
- Save products locally to influence later recommendations.
- Filter to saved items and inspect product details.
- Exclude unavailable inventory before returning results.

The included catalog contains eight fictional products, including an out of stock test item. There is no checkout, external commerce feed or user account service. The ranking system runs locally without paid AI APIs.

## How it works

```text
Angular interface → Java catalog API → Go ranking service
                         ↓                    ↓
                   catalog.json         30 second cache
```

| Component | Responsibility |
| --- | --- |
| Angular | Search, filters, saved products and accessible detail dialogs |
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

Saved product IDs live in browser `localStorage` and are sent to the API when building recommendations. They do not sync across browsers or devices. No purchase history or external tracking service is connected.

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
| `docs/` | Architecture, design provenance and verification details |

The public demo uses a rate limited gateway and a single replica. See [deployment and operations](docs/deployment.md) for CI/CD, resource limits and rollback. The catalog remains fictional sample inventory.

## License

Original project code is licensed under the [MIT License](LICENSE), copyright © 2026 Swarneil Pradhan. Bundled DM Sans and Instrument Serif fonts retain their SIL Open Font Licenses in [`frontend/public/fonts`](frontend/public/fonts). Third party dependencies retain their respective licenses.

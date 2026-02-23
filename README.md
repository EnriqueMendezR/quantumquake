# QuantumQuake

Real-time earthquake visualisation powered by AI (Vercel AI SDK + Claude) and a quantum anomaly-scoring microservice (Qiskit + FastAPI).

## Repository layout

```
quantumquake/
├── apps/
│   ├── web/        # Next.js 14 frontend + AI route handler
│   └── quantum/    # FastAPI Python microservice (Qiskit)
├── package.json    # npm workspace root
└── README.md
```

---

## 1. Web app (Next.js)

### Prerequisites

- Node.js 18+
- An Anthropic API key → copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill in your key.

```bash
cp apps/web/.env.local.example apps/web/.env.local
# edit apps/web/.env.local and set ANTHROPIC_API_KEY=sk-ant-...
```

### Install & run

```bash
# From the repo root — installs all workspace packages
npm install

# Start the Next.js dev server on http://localhost:3000
npm run dev
```

### Try it

Type a prompt such as:

> Show me M3+ earthquakes in California in the last 7 days

The AI will call the `getEarthquakes` tool, which fetches live data from the USGS API. The **region** from that tool call (e.g. `california`) is sent to the **Inference API**, which returns risk cells + earthquake points for the map. The map shows both risk heat cells and quake markers in one view.

### Inference API (required for the combined map)

From the repo root, with dependencies from `inference.py` (httpx, pandas, numpy, pennylane, sklearn, etc.) and `weights.npy` + `scaler.pkl` in place:

```bash
# Python venv with inference deps, then:
uvicorn inference_api:app --reload --port 8001
```

The Next.js app will call `http://localhost:8001` (or `INFERENCE_API_URL`) when you pass `?region=california` to `/api/risk-data`. The agent infers the region from the user prompt and passes it in `getEarthquakes`; the frontend reads that and requests the inference API for the same region.

---

## 2. Quantum microservice (FastAPI)

### Prerequisites

- Python 3.10+
- (Recommended) create a virtual environment first.

### Install

```bash
cd apps/quantum
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### Run

```bash
uvicorn main:app --reload --port 8000
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/quantum/score` | Accept feature vectors, return quantum anomaly scores |
| `POST` | `/quantum/health` | Returns `{"status":"ok"}` if Qiskit is running |

**Example `/quantum/score` request:**

```json
{
  "features": [
    [0.8, 0.6, 0.9, 0.7],
    [0.1, 0.2, 0.1, 0.0]
  ]
}
```

**Example response:**

```json
{
  "scores": [0.312, 0.004]
}
```

---

## Architecture

```
Browser
  │
  ├─► Next.js (port 3000)
  │     ├─ page.tsx            — Chat UI + single map (risk + quakes)
  │     ├─ /api/chat           — Vercel AI SDK streamText
  │     │     └─ getEarthquakes(region, …) → USGS; frontend reads region from tool args
  │     └─ /api/risk-data?region= — Proxies to Inference API or serves static GeoJSON
  │
  ├─► Inference API (port 8001)  uvicorn inference_api:app --port 8001
  │     └─ /risk-data?region=    — Runs inference.py for region, returns GeoJSON
  │
  └─► FastAPI (port 8000)
        └─ /quantum/score       — Qiskit AerSimulator anomaly scoring
```

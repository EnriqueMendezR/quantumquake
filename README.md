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

The AI will call the `getEarthquakes` tool, which fetches live data from the USGS API, plots circle markers on the map, and streams back a short natural language summary.

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
  │     ├─ page.tsx          — Leaflet map + chat UI
  │     └─ /api/chat         — Vercel AI SDK streamText
  │           └─ getEarthquakes tool → USGS Earthquake API
  │
  └─► FastAPI (port 8000)
        └─ /quantum/score    — Qiskit AerSimulator anomaly scoring
```

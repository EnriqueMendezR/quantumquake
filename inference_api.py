"""
FastAPI server that runs earthquake risk inference for a given region.
Run: uvicorn inference_api:app --reload --port 8001
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from inference import run_inference, REGIONS

app = FastAPI(
    title="QuantumQuake Inference API",
    description="Run earthquake risk inference for a region; returns GeoJSON (risk cells + quake points).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/risk-data")
def get_risk_data(region: str = "california"):
    """
    Run inference for the given region and return GeoJSON.
    Query param: region (e.g. california, west_coast).
    """
    region = (region or "california").strip().lower()
    if region not in REGIONS:
        region = "california"
    try:
        geojson = run_inference(region)
        return geojson
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/regions")
def list_regions():
    """Return supported region names and their bounding boxes."""
    return {
        "regions": list(REGIONS.keys()),
        "bounds": {k: {"minlat": v[0], "maxlat": v[1], "minlon": v[2], "maxlon": v[3]} for k, v in REGIONS.items()},
    }


@app.get("/health")
def health():
    return {"status": "ok"}

"""
Earthquake risk inference: fetch USGS data, compute risk cells with a variational
quantum classifier, return GeoJSON. Can be run as a script or via run_inference(region).
"""
import httpx
import pandas as pd
import numpy as np
import json
import os
from sklearn.preprocessing import StandardScaler
import pennylane as qml
from pennylane import numpy as pnp
from datetime import datetime, timedelta
import pickle

# Region name -> (minlat, maxlat, minlon, maxlon) for USGS query
REGIONS = {
    "california": (32, 42, -125, -114),
    "west_coast": (32, 49, -125, -114),
}

def _script_dir():
    return os.path.dirname(os.path.abspath(__file__))

dev = qml.device("default.qubit", wires=5)

def encode(features):
    for i in range(5):
        qml.RY(features[i], wires=i)

def layer(weights):
    for i in range(4):
        qml.CNOT(wires=[i, i + 1])
    for i in range(5):
        qml.RY(weights[i], wires=i)

@qml.qnode(dev)
def circuit(features, weights):
    encode(features)
    for w in weights:
        layer(w)
    return qml.expval(qml.PauliZ(0))

def cell_to_region(lat, lon):
    if lat >= 46:
        return "Washington"
    elif lat >= 42:
        return "Oregon"
    elif lat >= 38:
        return "Northern California"
    elif lat >= 35:
        return "Central California"
    else:
        return "Southern California"

def b_value(mags, m_min=3.0):
    mags = mags[mags >= m_min]
    if len(mags) < 5:
        return np.nan
    return np.log10(np.e) / (mags.mean() - m_min)

def run_inference(region: str = "california"):
    """
    Run earthquake risk inference for the given region.
    Returns a GeoJSON FeatureCollection dict (risk cells + earthquake points).
    """
    bbox = REGIONS.get(region.lower(), REGIONS["california"])
    minlat, maxlat, minlon, maxlon = bbox

    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

    resp = httpx.get(
        "https://earthquake.usgs.gov/fdsnws/event/1/query",
        params={
            "format": "geojson",
            "starttime": start,
            "endtime": end,
            "minmagnitude": 3.0,
            "minlatitude": minlat,
            "maxlatitude": maxlat,
            "minlongitude": minlon,
            "maxlongitude": maxlon,
            "limit": 20000,
        },
        timeout=60,
    )
    raw = resp.json()["features"]
    df = pd.DataFrame([
        {
            "time": f["properties"]["time"],
            "mag": f["properties"]["mag"],
            "place": f["properties"]["place"],
            "lat": f["geometry"]["coordinates"][1],
            "lon": f["geometry"]["coordinates"][0],
            "depth": f["geometry"]["coordinates"][2],
        }
        for f in raw
    ])

    df["time"] = pd.to_datetime(df["time"], unit="ms")
    df["month"] = df["time"].dt.to_period("M")
    df["grid_lat"] = (df["lat"] // 2) * 2
    df["grid_lon"] = (df["lon"] // 2) * 2
    df["cell"] = df["grid_lat"].astype(str) + "," + df["grid_lon"].astype(str)

    latest_month = df["month"].max()
    latest = df[df["month"] == latest_month]

    features = latest.groupby("cell").agg(
        N=("mag", "count"),
        mean_mag=("mag", "mean"),
        max_mag=("mag", "max"),
        mean_depth=("depth", "mean"),
        lat=("grid_lat", "first"),
        lon=("grid_lon", "first"),
    ).reset_index()
    features["b_val"] = latest.groupby("cell")["mag"].apply(b_value).values
    features["b_val"] = features["b_val"].fillna(features["b_val"].mean())
    features["region"] = features.apply(
        lambda r: cell_to_region(r["lat"], r["lon"]), axis=1
    )

    notable = latest.sort_values("mag", ascending=False).drop_duplicates("cell")
    notable_map = {}
    for _, r in notable.iterrows():
        notable_map[r["cell"]] = {
            "mag": float(r["mag"]),
            "place": r["place"] if pd.notna(r["place"]) else "",
            "time": r["time"].isoformat(),
            "depth": float(r["depth"]),
        }

    base = _script_dir()
    weights_path = os.path.join(base, "weights.npy")
    scaler_path = os.path.join(base, "scaler.pkl")
    weights = pnp.array(np.load(weights_path), requires_grad=False)
    scaler = pickle.load(open(scaler_path, "rb"))

    feature_cols = ["N", "mean_mag", "max_mag", "mean_depth", "b_val"]
    X = features[feature_cols].values
    X_scaled = scaler.transform(X)

    geojson_features = []

    for i, row in features.iterrows():
        prob = float((1 - circuit(X_scaled[i], weights)) / 2)
        risk = "high" if prob > 0.7 else "moderate" if prob > 0.4 else "low"
        lat, lon = float(row["lat"]), float(row["lon"])
        notable_event = notable_map.get(row["cell"], None)
        geojson_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [lon, lat], [lon + 2, lat], [lon + 2, lat + 2],
                    [lon, lat + 2], [lon, lat],
                ]],
            },
            "properties": {
                "type": "risk_cell",
                "cell": row["cell"],
                "region": row["region"],
                "risk_prob": round(prob, 4),
                "risk_level": risk,
                "quake_count": int(row["N"]),
                "mean_mag": round(float(row["mean_mag"]), 2),
                "max_mag": round(float(row["max_mag"]), 1),
                "mean_depth_km": round(float(row["mean_depth"]), 1),
                "b_value": round(float(row["b_val"]), 3),
                "notable_event": notable_event,
            },
        })

    for _, row in df.iterrows():
        geojson_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(row["lon"]), float(row["lat"])],
            },
            "properties": {
                "type": "earthquake",
                "mag": float(row["mag"]),
                "depth": float(row["depth"]),
                "place": row["place"] if pd.notna(row["place"]) else "",
                "time": row["time"].isoformat(),
            },
        })

    return {
        "type": "FeatureCollection",
        "metadata": {
            "generated": datetime.now().isoformat(),
            "data_window": {"start": start, "end": end},
            "report_month": str(latest_month),
            "total_quakes_90d": len(df),
            "active_cells": len(features),
            "region": region,
            "model": "Variational Quantum Classifier (3-layer, 5-qubit)",
            "disclaimer": "Experimental model — not a substitute for official seismic forecasts.",
        },
        "features": geojson_features,
    }


if __name__ == "__main__":
    import sys
    region = (sys.argv[1] if len(sys.argv) > 1 else "california").lower()
    if region not in REGIONS:
        region = "california"
    output = run_inference(region)

    with open("earthquake_risk.geojson", "w") as f:
        json.dump(output, f, indent=2)
    _web_public = os.path.join(
        _script_dir(), "apps", "web", "public", "earthquake_risk.geojson"
    )
    os.makedirs(os.path.dirname(_web_public), exist_ok=True)
    with open(_web_public, "w") as f:
        json.dump(output, f, indent=2)

    n_cells = output["metadata"]["active_cells"]
    n_quakes = output["metadata"]["total_quakes_90d"]
    print(f"✅ Wrote {len(output['features'])} features (region={region})")
    print(f"   {n_cells} risk cells + {n_quakes} quake points")

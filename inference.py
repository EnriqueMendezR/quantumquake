import httpx, pandas as pd, numpy as np, json
from sklearn.preprocessing import StandardScaler
import pennylane as qml
from pennylane import numpy as pnp
from datetime import datetime, timedelta
import pickle

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

# ── Fetch last 90 days, full West Coast ──
end = datetime.now().strftime("%Y-%m-%d")
start = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

print("Fetching earthquake data...")
resp = httpx.get("https://earthquake.usgs.gov/fdsnws/event/1/query", params={
    "format": "geojson", "starttime": start, "endtime": end,
    "minmagnitude": 3.0, "minlatitude": 32, "maxlatitude": 49,
    "minlongitude": -125, "maxlongitude": -114, "limit": 20000,
}, timeout=60)

raw = resp.json()["features"]
df = pd.DataFrame([{
    "time": f["properties"]["time"], "mag": f["properties"]["mag"],
    "place": f["properties"]["place"],
    "lat": f["geometry"]["coordinates"][1],
    "lon": f["geometry"]["coordinates"][0],
    "depth": f["geometry"]["coordinates"][2],
} for f in raw])

df["time"] = pd.to_datetime(df["time"], unit="ms")
df["month"] = df["time"].dt.to_period("M")
df["grid_lat"] = (df["lat"] // 2) * 2
df["grid_lon"] = (df["lon"] // 2) * 2
df["cell"] = df["grid_lat"].astype(str) + "," + df["grid_lon"].astype(str)

def cell_to_region(lat, lon):
    if lat >= 46: return "Washington"
    elif lat >= 42: return "Oregon"
    elif lat >= 38: return "Northern California"
    elif lat >= 35: return "Central California"
    else: return "Southern California"

def b_value(mags, m_min=3.0):
    mags = mags[mags >= m_min]
    if len(mags) < 5: return np.nan
    return np.log10(np.e) / (mags.mean() - m_min)

latest_month = df["month"].max()
latest = df[df["month"] == latest_month]

features = latest.groupby("cell").agg(
    N=("mag", "count"), mean_mag=("mag", "mean"),
    max_mag=("mag", "max"), mean_depth=("depth", "mean"),
    lat=("grid_lat", "first"), lon=("grid_lon", "first"),
).reset_index()
features["b_val"] = latest.groupby("cell")["mag"].apply(b_value).values
features["b_val"] = features["b_val"].fillna(features["b_val"].mean())
features["region"] = features.apply(lambda r: cell_to_region(r["lat"], r["lon"]), axis=1)

# Notable quakes per cell
notable = latest.sort_values("mag", ascending=False).drop_duplicates("cell")
notable_map = {}
for _, r in notable.iterrows():
    notable_map[r["cell"]] = {
        "mag": float(r["mag"]), "place": r["place"] if pd.notna(r["place"]) else "",
        "time": r["time"].isoformat(), "depth": float(r["depth"]),
    }

# ── Load model + predict ──
weights = pnp.array(np.load("weights.npy"), requires_grad=False)
scaler = pickle.load(open("scaler.pkl", "rb"))

feature_cols = ["N", "mean_mag", "max_mag", "mean_depth", "b_val"]
X = features[feature_cols].values
X_scaled = scaler.transform(X)

geojson_features = []

for i, row in features.iterrows():
    prob = float((1 - circuit(X_scaled[i], weights)) / 2)
    risk = "high" if prob > 0.7 else "moderate" if prob > 0.4 else "low"
    lat, lon = float(row["lat"]), float(row["lon"])
    notable_event = notable_map.get(row["cell"], None)

    # Grid cell as a polygon (2°×2° box)
    geojson_features.append({
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [lon, lat], [lon + 2, lat], [lon + 2, lat + 2], [lon, lat + 2], [lon, lat],
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

output = {
    "type": "FeatureCollection",
    "metadata": {
        "generated": datetime.now().isoformat(),
        "data_window": {"start": start, "end": end},
        "report_month": str(latest_month),
        "total_quakes_90d": len(df),
        "active_cells": len(features),
        "model": "Variational Quantum Classifier (3-layer, 5-qubit)",
        "disclaimer": "Experimental model — not a substitute for official seismic forecasts.",
    },
    "features": geojson_features,
}

with open("earthquake_risk.geojson", "w") as f:
    json.dump(output, f, indent=2)

print(f"✅ Wrote {len(geojson_features)} features to earthquake_risk.geojson")
print(f"   {len(features)} risk cells + {len(df)} quake points")
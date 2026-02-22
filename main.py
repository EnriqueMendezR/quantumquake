import httpx, pandas as pd, numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import StandardScaler
import pennylane as qml
from pennylane import numpy as pnp

# ── 1. Fetch data from USGS ──
print("Fetching earthquake data...")
resp = httpx.get("https://earthquake.usgs.gov/fdsnws/event/1/query", params={
    "format": "geojson", "starttime": "2000-01-01", "endtime": "2024-12-31",
    "minmagnitude": 3.0, "minlatitude": 32, "maxlatitude": 42,
    "minlongitude": -125, "maxlongitude": -114, "limit": 20000
}, timeout=60)

df = pd.DataFrame([{"time": f["properties"]["time"], "mag": f["properties"]["mag"],
    "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0],
    "depth": f["geometry"]["coordinates"][2]} for f in resp.json()["features"]])

df["time"] = pd.to_datetime(df["time"], unit="ms")
df["month"] = df["time"].dt.to_period("M")
df["grid_lat"] = (df["lat"] // 2) * 2
df["grid_lon"] = (df["lon"] // 2) * 2
df["cell"] = df["grid_lat"].astype(str) + "," + df["grid_lon"].astype(str)
print(f"Got {len(df)} earthquakes in {df['cell'].nunique()} grid cells")

# ── 2. Feature engineering ──
def b_value(mags, m_min=3.0):
    mags = mags[mags >= m_min]
    if len(mags) < 5: return np.nan
    return np.log10(np.e) / (mags.mean() - m_min)

monthly = df.groupby(["cell", "month"]).agg(
    N=("mag", "count"), mean_mag=("mag", "mean"),
    max_mag=("mag", "max"), mean_depth=("depth", "mean")
).reset_index()
monthly["b_val"] = df.groupby(["cell", "month"])["mag"].apply(b_value).values
monthly["b_val"] = monthly["b_val"].fillna(monthly["b_val"].mean())

# ── 3. Labels: M5.0+ in this cell within next 6 months? ──
monthly["label"] = 0
for cell in monthly["cell"].unique():
    mask = monthly["cell"] == cell
    cell_df = monthly[mask].reset_index()
    for i in range(len(cell_df)):
        future = cell_df.iloc[i:i+6]
        if future["max_mag"].max() >= 5.0:
            monthly.loc[cell_df.loc[i, "index"], "label"] = 1

feature_cols = ["N", "mean_mag", "max_mag", "mean_depth", "b_val"]
X = monthly[feature_cols].values
y = monthly["label"].values
print(f"Label distribution: {pd.Series(y).value_counts().to_dict()}")

# ── 4. Scale + split ──
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42, stratify=y)

# ── 5. Classical model ──
print("\n--- Classical Model (Random Forest) ---")
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)
print(classification_report(y_test, clf.predict(X_test)))

# ── 6. Quantum model ──
print("--- Quantum Model (VQC) ---")
dev = qml.device("default.qubit", wires=5)

def encode(features):
    for i in range(5):
        qml.RY(features[i], wires=i)

def layer(weights):
    for i in range(4):
        qml.CNOT(wires=[i, i+1])
    for i in range(5):
        qml.RY(weights[i], wires=i)

@qml.qnode(dev)
def circuit(features, weights):
    encode(features)
    for w in weights:
        layer(w)
    return qml.expval(qml.PauliZ(0))

def predict(features, weights):
    raw = circuit(features, weights)
    return (1 - raw) / 2

def cost(weights, X, y):
    loss = 0.0
    for i in range(len(X)):
        pred = predict(X[i], weights)
        loss = loss + (pred - y[i]) ** 2
    return loss / len(X)

n_layers = 3
weights = pnp.array(np.random.randn(n_layers, 5) * 0.1, requires_grad=True)
opt = qml.GradientDescentOptimizer(stepsize=0.3)

X_train_q = X_train[:60]
y_train_q = y_train[:60]

for epoch in range(30):
    weights = opt.step(lambda w: cost(w, X_train_q, y_train_q), weights)
    if (epoch + 1) % 5 == 0:
        loss = cost(weights, X_train_q, y_train_q)
        print(f"Epoch {epoch+1:3d} | Loss: {loss:.4f}")

preds = [1 if predict(x, weights) > 0.5 else 0 for x in X_test]
print(f"\nQuantum accuracy: {sum(p == t for p, t in zip(preds, y_test)) / len(y_test):.2%}")

import pickle
pickle.dump(scaler, open("scaler.pkl", "wb"))
np.save("weights.npy", weights)

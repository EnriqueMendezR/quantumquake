"use client";

import { MapContainer, TileLayer, Polygon, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

interface RiskCellProperties {
  type: "risk_cell";
  cell: string;
  region: string;
  risk_prob: number;
  risk_level: string;
  quake_count: number;
  mean_mag: number;
  max_mag: number;
  mean_depth_km: number;
  b_value: number;
  notable_event?: {
    mag: number;
    place: string;
    time: string;
    depth: number;
  };
}

interface RiskFeature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: RiskCellProperties;
}

interface RiskGeoJSON {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: RiskFeature[];
}

function riskColor(prob: number): string {
  if (prob > 0.7) return "#dc2626"; // red - high
  if (prob > 0.4) return "#ca8a04"; // yellow/amber - moderate
  return "#16a34a"; // green - low
}

function GeoJSONBounds({ features }: { features: RiskFeature[] }) {
  const map = useMap();
  useEffect(() => {
    if (features.length === 0) return;
    const lats: number[] = [];
    const lngs: number[] = [];
    features.forEach((f) => {
      f.geometry.coordinates[0].forEach(([lng, lat]) => {
        lats.push(lat);
        lngs.push(lng);
      });
    });
    if (lats.length && lngs.length) {
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        { padding: [20, 20], maxZoom: 6 }
      );
    }
  }, [map, features]);
  return null;
}

export default function RiskHeatMap() {
  const [data, setData] = useState<RiskGeoJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/risk-data")
      .then((r) => r.json())
      .then((json) => {
        if (json.features && Array.isArray(json.features) && json.features.length > 0) {
          setData(json as RiskGeoJSON);
          setError(null);
        } else if (json.metadata?.error) {
          // No file yet — show friendly empty state, not an error
          setData({ type: "FeatureCollection", features: [] });
          setError(null);
        } else {
          setError("Invalid risk data");
        }
      })
      .catch((e) => setError(e.message || "Failed to load risk data"));
  }, []);

  const riskCells = data?.features?.filter(
    (f) => f.properties?.type === "risk_cell"
  ) as RiskFeature[] | undefined;

  if (error && !riskCells?.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
          color: "#666",
          fontSize: 13,
          padding: 16,
          textAlign: "center",
        }}
      >
        {error}
      </div>
    );
  }

  if (!riskCells?.length) {
    const isNoData = data && data.features.length === 0;
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
          color: "#666",
          fontSize: 13,
          padding: 16,
          textAlign: "center",
        }}
      >
        {isNoData
          ? "Run inference.py from the repo root to generate the risk heat map."
          : "Loading risk heat map…"}
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapContainer
        center={[40, -120]}
        zoom={5}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM & CARTO'
          subdomains="abcd"
          maxZoom={20}
        />
        <GeoJSONBounds features={riskCells} />
        {riskCells.map((feature, i) => {
          const coords = feature.geometry.coordinates[0];
          const latLngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
          const props = feature.properties;
          const fill = riskColor(props.risk_prob);

          return (
            <Polygon
              key={props.cell ?? i}
              positions={latLngs}
              pathOptions={{
                fillColor: fill,
                color: fill,
                fillOpacity: 0.6,
                weight: 1,
              }}
            >
              <Popup>
                <div style={{ color: "#111", minWidth: 200, fontSize: 12 }}>
                  <strong>{props.region}</strong> · {props.risk_level} risk
                  <br />
                  <span style={{ color: "#555" }}>
                    Probability: {(props.risk_prob * 100).toFixed(1)}%
                  </span>
                  <br />
                  Quakes: {props.quake_count} · Max M{props.max_mag.toFixed(1)} · Mean
                  depth {props.mean_depth_km} km
                  {props.notable_event && (
                    <>
                      <br />
                      <span style={{ fontSize: 11, color: "#666" }}>
                        Notable: M{props.notable_event.mag} — {props.notable_event.place}
                      </span>
                    </>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}

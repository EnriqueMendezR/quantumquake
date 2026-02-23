"use client";

import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
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

interface EarthquakeProperties {
  type: "earthquake";
  mag: number;
  depth: number;
  place: string;
  time: string;
}

type GeoFeature =
  | {
      type: "Feature";
      geometry: { type: "Polygon"; coordinates: number[][][] };
      properties: RiskCellProperties;
    }
  | {
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: EarthquakeProperties;
    };

interface InferenceGeoJSON {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: GeoFeature[];
}

function riskColor(prob: number): string {
  if (prob > 0.7) return "#dc2626";
  if (prob > 0.4) return "#ca8a04";
  return "#16a34a";
}

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "#ef4444";
  if (mag >= 4) return "#f97316";
  if (mag >= 2) return "#eab308";
  return "#9ca3af";
}

function FitBounds({ features }: { features: GeoFeature[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [];
    features.forEach((f) => {
      if (f.geometry.type === "Point") {
        const [lng, lat] = f.geometry.coordinates;
        points.push([lat, lng]);
      } else {
        f.geometry.coordinates[0].forEach(([lng, lat]) => points.push([lat, lng]));
      }
    });
    if (points.length < 2) return;
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [24, 24], maxZoom: 6 }
    );
  }, [map, features]);
  return null;
}

interface InferenceMapProps {
  /** Region extracted from the agent's getEarthquakes call (e.g. "california"). */
  region: string | null;
}

export default function InferenceMap({ region }: InferenceMapProps) {
  const [data, setData] = useState<InferenceGeoJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : "";
    fetch(`/api/risk-data${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.features && Array.isArray(json.features)) {
          setData(json as InferenceGeoJSON);
          setError(json.metadata?.error ? String(json.metadata.error) : null);
        } else {
          setError("Invalid risk data");
        }
      })
      .catch((e) => setError(e.message || "Failed to load map data"));
  }, [region]);

  const riskCells = data?.features?.filter(
    (f): f is GeoFeature & { geometry: { type: "Polygon"; coordinates: number[][][] }; properties: RiskCellProperties } =>
      f.properties?.type === "risk_cell"
  );
  const earthquakes = data?.features?.filter(
    (f): f is GeoFeature & { geometry: { type: "Point"; coordinates: [number, number] }; properties: EarthquakeProperties } =>
      f.properties?.type === "earthquake"
  );

  const hasAny = (riskCells?.length ?? 0) + (earthquakes?.length ?? 0) > 0;

  if (error && !hasAny) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
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

  if (!data && !error) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
          color: "#666",
          fontSize: 13,
        }}
      >
        Loading map…
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
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
        Start the inference API (uvicorn inference_api:app --port 8001) and submit a
        query to see risk and earthquakes for the selected region.
      </div>
    );
  }

  const allFeatures = data!.features;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapContainer
        center={[37, -119]}
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
        <FitBounds features={allFeatures} />
        {riskCells?.map((feature, i) => {
          const coords = feature.geometry.coordinates[0];
          const latLngs = coords.map(
            ([lng, lat]) => [lat, lng] as [number, number]
          );
          const props = feature.properties;
          const fill = riskColor(props.risk_prob);
          return (
            <Polygon
              key={props.cell ?? i}
              positions={latLngs}
              pathOptions={{
                fillColor: fill,
                color: fill,
                fillOpacity: 0.5,
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
                  Quakes: {props.quake_count} · Max M{props.max_mag.toFixed(1)}
                  {props.notable_event && (
                    <>
                      <br />
                      <span style={{ fontSize: 11, color: "#666" }}>
                        Notable: M{props.notable_event.mag} —{" "}
                        {props.notable_event.place}
                      </span>
                    </>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}
        {earthquakes?.map((feature, i) => {
          const [lng, lat] = feature.geometry.coordinates;
          const mag = feature.properties.mag ?? 0;
          const color = magnitudeColor(mag);
          return (
            <CircleMarker
              key={i}
              center={[lat, lng]}
              radius={Math.max(mag * 3, 4)}
              fillColor={color}
              color={color}
              fillOpacity={0.8}
              weight={1}
            >
              <Popup>
                <div style={{ color: "#111", minWidth: 160 }}>
                  <strong>M{mag.toFixed(1)}</strong>
                  <br />
                  {feature.properties.place}
                  <br />
                  <span style={{ fontSize: "0.85em", color: "#555" }}>
                    {new Date(feature.properties.time).toLocaleString()}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

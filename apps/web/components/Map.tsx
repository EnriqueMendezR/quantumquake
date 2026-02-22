"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface EarthquakeFeature {
  id: string;
  geometry: { coordinates: [number, number, number] };
  properties: {
    mag: number;
    place: string;
    time: number;
  };
}

interface MapProps {
  earthquakes: EarthquakeFeature[];
}

function getMagnitudeColor(mag: number): string {
  if (mag >= 6) return "#ef4444"; // red
  if (mag >= 4) return "#f97316"; // orange
  if (mag >= 2) return "#eab308"; // yellow
  return "#9ca3af"; // gray
}

export default function Map({ earthquakes }: MapProps) {
  return (
    // The wrapper div ensures the map fills whatever flex/absolute parent it lives in
    <div style={{ position: "absolute", inset: 0 }}>
    <MapContainer
      center={[37, -119]}
      zoom={6}
      style={{ width: "100%", height: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />
      {earthquakes.map((eq, i) => {
        const [lng, lat] = eq.geometry.coordinates;
        const mag = eq.properties.mag ?? 0;
        const color = getMagnitudeColor(mag);
        const time = new Date(eq.properties.time).toLocaleString();

        return (
          <CircleMarker
            key={eq.id || i}
            center={[lat, lng]}
            radius={Math.max(mag * 3, 4)}
            fillColor={color}
            color={color}
            fillOpacity={0.7}
            weight={1}
          >
            <Popup>
              <div style={{ color: "#111", minWidth: 160 }}>
                <strong>M{mag.toFixed(1)}</strong>
                <br />
                {eq.properties.place}
                <br />
                <span style={{ fontSize: "0.85em", color: "#555" }}>{time}</span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
    </div>
  );
}

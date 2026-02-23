import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const INFERENCE_API_URL =
  process.env.INFERENCE_API_URL || "http://localhost:8001";

/** Serves risk GeoJSON: from Inference API when region is set, else from file. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region")?.trim() || null;

  if (region) {
    try {
      const res = await fetch(
        `${INFERENCE_API_URL}/risk-data?region=${encodeURIComponent(region)}`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          {
            type: "FeatureCollection",
            metadata: { error: `Inference API error: ${err}` },
            features: [],
          },
          { status: 200 }
        );
      }
      const geojson = await res.json();
      return NextResponse.json(geojson);
    } catch (e) {
      return NextResponse.json(
        {
          type: "FeatureCollection",
          metadata: {
            error: `Inference API unreachable (is it running on ${INFERENCE_API_URL}?). ${String(e)}`,
          },
          features: [],
        },
        { status: 200 }
      );
    }
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "public", "earthquake_risk.geojson"),
    path.join(cwd, "..", "..", "earthquake_risk.geojson"),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, "utf-8");
      const geojson = JSON.parse(raw);
      return NextResponse.json(geojson);
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    {
      type: "FeatureCollection",
      metadata: {
        error:
          "No region provided and no earthquake_risk.geojson found. Start the inference API or run inference.py.",
      },
      features: [],
    },
    { status: 200 }
  );
}

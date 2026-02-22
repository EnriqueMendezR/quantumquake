import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/** Serves earthquake_risk.geojson produced by inference.py (repo root or public). */
export async function GET() {
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
      metadata: { error: "No earthquake_risk.geojson found. Run inference.py and copy output to apps/web/public/earthquake_risk.geojson" },
      features: [],
    },
    { status: 200 }
  );
}

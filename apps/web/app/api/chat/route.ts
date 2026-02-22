import { streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: anthropic("claude-opus-4-6"),
    system:
      "You are an earthquake data assistant. When users ask about earthquakes, use the getEarthquakes tool to fetch real USGS data. After the tool runs, write a short 2-3 sentence natural language summary of what you found: how many earthquakes, the magnitude range, and any notable events.",
    messages,
    tools: {
      getEarthquakes: tool({
        description:
          "Fetch earthquake data from the USGS API for a given magnitude threshold, time range, and optional region.",
        parameters: z.object({
          minMagnitude: z
            .number()
            .describe("Minimum earthquake magnitude to include"),
          days: z
            .number()
            .describe("Number of days back from today to query"),
          region: z
            .string()
            .optional()
            .describe(
              'Optional region filter. Use "california" to restrict to the California bounding box.'
            ),
        }),
        execute: async ({ minMagnitude, days, region }) => {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);

          const params = new URLSearchParams({
            format: "geojson",
            minmagnitude: String(minMagnitude),
            starttime: startDate.toISOString().split("T")[0],
            endtime: endDate.toISOString().split("T")[0],
          });

          if (region?.toLowerCase() === "california") {
            params.set("minlatitude", "32");
            params.set("maxlatitude", "42");
            params.set("minlongitude", "-125");
            params.set("maxlongitude", "-114");
          }

          const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`USGS API error: ${response.status}`);
          }

          const data = await response.json();
          return data.features || [];
        },
      }),
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

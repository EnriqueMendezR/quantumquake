import { streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getChatSystemPrompt } from "../../../lib/prompts";

export const runtime = "nodejs";

// Limits enforced regardless of what the model requests (keeps the agent bounded)
const MAX_DAYS = 90;
const MIN_DAYS = 1;
const MIN_MAG_RANGE = [0, 10] as const;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: anthropic("claude-opus-4-6"),
    system: getChatSystemPrompt(),
    messages,
    tools: {
      getEarthquakes: tool({
        description:
          "Fetch earthquake data from the USGS API. Allowed: minMagnitude 0–10, days 1–90 back from today, optional region 'california' only. Use this only when the user asks about earthquakes.",
        parameters: z.object({
          minMagnitude: z
            .number()
            .min(0)
            .max(10)
            .describe("Minimum earthquake magnitude (0–10)"),
          days: z
            .number()
            .min(1)
            .max(90)
            .describe("Days back from today to query (1–90)"),
          region: z
            .enum(["california"])
            .optional()
            .describe("Optional. Use 'california' to restrict to California bounding box."),
        }),
        execute: async ({ minMagnitude, days, region }) => {
          const clampedDays = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(days)));
          const clampedMag = Math.max(
            MIN_MAG_RANGE[0],
            Math.min(MIN_MAG_RANGE[1], minMagnitude)
          );

          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - clampedDays);

          const params = new URLSearchParams({
            format: "geojson",
            minmagnitude: String(clampedMag),
            starttime: startDate.toISOString().split("T")[0],
            endtime: endDate.toISOString().split("T")[0],
          });

          if (region === "california") {
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
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}

import { getActiveModels, getCapabilities, isDemo } from "@/lib/ai/models";

export function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const curatedCapabilities = getCapabilities();

  if (isDemo) {
    const models = getActiveModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [
        m.id,
        curatedCapabilities[m.id] ?? {
          tools: true,
          vision: true,
          reasoning: false,
        },
      ])
    );

    return Response.json({ capabilities, models }, { headers });
  }

  return Response.json(curatedCapabilities, { headers });
}

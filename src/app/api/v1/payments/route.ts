export async function POST() {
  return Response.json(
    {
      error: {
        code: "ENDPOINT_RETIRED",
        message: "Simulated payments are unavailable. Record completed sales through the authenticated operations checkout.",
      },
    },
    { status: 410 },
  );
}

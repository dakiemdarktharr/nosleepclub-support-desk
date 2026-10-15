import {
  enforceDemoRateLimit,
  requireEmployeeIdentity,
  supportApi,
  supportBody,
} from "@/lib/support-http";
import { previewSupport } from "@/services/support";
import { measureSupportStage, supportMeasurements, withSupportMeasurements } from "@/lib/support-telemetry";
export async function POST(request: Request) {
  return withSupportMeasurements(async () => {
    const response = await supportApi(async () => {
      const body = await measureSupportStage("validationAuth", async () => {
        enforceDemoRateLimit(request, "intake");
        return requireEmployeeIdentity(await supportBody(request), request);
      });
      const result = await previewSupport(body);
      return { ...result, diagnostics: supportMeasurements() };
    });
    const metrics = supportMeasurements();
    if (metrics) response.headers.set("Server-Timing", [
      `total;dur=${metrics.totalMs}`,
      ...Object.entries(metrics.stagesMs).map(([name, duration]) => `${name};dur=${duration}`),
    ].join(", "));
    return response;
  });
}

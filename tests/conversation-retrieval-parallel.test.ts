import { afterEach, expect, it, vi } from "vitest";
import { knowledgeSeed } from "@/domain/knowledge";
import type { CanonicalRequest } from "@/domain/contracts";

const mocks = vi.hoisted(() => ({
  database: undefined as unknown,
  reserveModelAttempt: vi.fn(async () => true),
}));

vi.mock("@/lib/support-repository", () => ({
  supportDatabase: () => mocks.database,
  reserveModelAttempt: () => mocks.reserveModelAttempt(),
}));

import { createConversationAnswer } from "@/lib/conversation-model";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("overlaps knowledge retrieval with public web lookup before generating the answer", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused");
  vi.stubEnv("AI_WEB_SEARCH", "true");
  vi.stubEnv("AI_WEB_MODEL", "synthetic-test");
  vi.stubEnv("AI_CONVERSATION_MODEL", "synthetic-test");

  let knowledgeReadComplete = false;
  let webStartedBeforeKnowledgeComplete = false;
  const db = {
    collection: (name: string) => {
      if (name === "v3_support_knowledge")
        return {
          createIndex: async () => "index",
          bulkWrite: async () => ({}),
          find: () => ({
            limit: () => ({
              toArray: () => new Promise((resolve) => {
                setTimeout(() => {
                  knowledgeReadComplete = true;
                  resolve(knowledgeSeed);
                }, 25);
              }),
            }),
          }),
        };
      return {
        findOne: async () => null,
        createIndex: async () => "index",
        updateOne: async () => ({}),
      };
    },
  };
  mocks.database = db;

  const publicText = "Tài liệu công khai có hướng dẫn cấu hình GPU.";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/v1/responses")) {
      webStartedBeforeKnowledgeComplete = !knowledgeReadComplete;
      return Response.json({
        status: "completed",
        output: [
          { type: "web_search_call", status: "completed" },
          {
            type: "message",
            content: [{
              type: "output_text",
              text: publicText,
              annotations: [{
                type: "url_citation",
                title: "VNG Cloud",
                url: "https://vngcloud.vn/",
              }],
            }],
          },
        ],
      });
    }
    if (url.includes("/v1/chat/completions"))
      return Response.json({
        choices: [{
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              label: "CLOUD_GPU_GUIDE",
              text: "Bạn có thể xem hướng dẫn công khai của VNG Cloud để bắt đầu cấu hình GPU.",
              knowledgeIds: [],
              evidence: [{ knowledgeId: "public-web", quote: publicText }],
            }),
          },
        }],
      });
    throw new Error(`Unexpected synthetic request: ${url}`);
  }));

  const request = {
    conversation: {
      label: "CLOUD_GPU_GUIDE",
      question: "Hướng dẫn cấu hình GPU",
      ignoredOverride: false,
    },
  } as unknown as CanonicalRequest;
  const answer = await createConversationAnswer(request);

  expect(webStartedBeforeKnowledgeComplete).toBe(true);
  expect(answer.answer?.webSearch).toBe("used");
  expect(answer.answer?.sources.map((source) => source.url)).toContain(
    "https://vngcloud.vn/",
  );
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { classifyFeedbackSentiment } from "@/lib/feedback-sentiment-model";

beforeEach(() => {
  vi.stubEnv("AI_SENTIMENT_PROVIDER", "ollama");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses a grounded local model label for an unfamiliar negative reply", async () => {
  const text = "That answer felt dismissive and unhelpful";
  const run = vi.fn(async () => ({
    sentiment: "negative",
    evidence: "dismissive and unhelpful",
  }));

  await expect(classifyFeedbackSentiment(text, { run })).resolves.toBe("negative");
  expect(run).toHaveBeenCalledOnce();
});

it("accepts a model label only when its quote appears in the redacted reply", async () => {
  const run = vi.fn(async () => ({
    sentiment: "positive",
    evidence: "Everything is fixed now",
  }));

  await expect(
    classifyFeedbackSentiment("It still does not work", { run }),
  ).resolves.toBe("neutral");
});

it("does not let sentiment override a still-broken or next-step signal", async () => {
  const run = vi.fn(async () => ({
    sentiment: "negative",
    evidence: "chưa làm được",
  }));

  await expect(
    classifyFeedbackSentiment("Mình chưa làm được, lỗi vẫn còn.", { run }),
  ).resolves.toBe("neutral");
  expect(run).not.toHaveBeenCalled();
});

it.each([
  undefined,
  "invalid output",
  { sentiment: "positive", evidence: "quote not in input" },
  { sentiment: "unknown", evidence: "not sure" },
])("fails safely to neutral for invalid or missing local output", async (output) => {
  const run = vi.fn(async () => output);
  await expect(
    classifyFeedbackSentiment("That answer felt odd", { run }),
  ).resolves.toBe("neutral");
});

it("fails safely to neutral when the local model call times out or errors", async () => {
  await expect(
    classifyFeedbackSentiment("That answer felt odd", {
      run: async () => {
        throw new Error("local model unavailable");
      },
    }),
  ).resolves.toBe("neutral");
});

it("rejects non-loopback Ollama endpoints", async () => {
  vi.stubEnv("AI_MAX_ATTEMPTS", "50");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("OLLAMA_BASE_URL", "https://example.com");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    classifyFeedbackSentiment("That answer felt odd"),
  ).resolves.toBe("neutral");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.skipIf(process.env.RUN_LOCAL_QWEN !== "1")(
  "classifies synthetic feedback through the installed local Qwen model",
  async () => {
    vi.stubEnv("AI_SENTIMENT_PROVIDER", "ollama");
    vi.stubEnv("AI_SENTIMENT_MODEL", "qwen3.5:4b");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("AI_SENTIMENT_TIMEOUT_MS", "30000");
    vi.stubEnv("AI_MAX_ATTEMPTS", "50");
    vi.stubEnv("MONGODB_URI", "");

    await expect(
      classifyFeedbackSentiment("That answer felt dismissive and unhelpful"),
    ).resolves.toBe("negative");
  },
  45000,
);

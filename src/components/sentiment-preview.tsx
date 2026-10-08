import type { SentimentAssessment } from "@/domain/contracts";
import { Badge, Card } from "@/components/ui";

const sentimentLabels: Record<SentimentAssessment["sentiment"], string> = {
  positive: "Tích cực",
  neutral: "Trung tính",
  negative: "Tiêu cực",
};

export function SentimentPreview({
  assessment,
}: {
  assessment: SentimentAssessment;
}) {
  const tone = assessment.sentiment === "positive"
    ? "success"
    : assessment.sentiment === "negative"
      ? "danger"
      : "neutral";
  const source = assessment.source === "model"
    ? `Model hội thoại${assessment.model ? `: ${assessment.model}` : ""}`
    : assessment.source === "rule-based"
      ? "Dự phòng theo luật (rule-based)"
      : "Chưa có mô tả để phân tích";

  return (
    <Card
      className="space-y-3"
      role="region"
      aria-label="Sentiment nhận diện trước khi gửi"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Sentiment dự đoán</h3>
        <Badge tone={tone}>{sentimentLabels[assessment.sentiment]}</Badge>
        <span className="text-sm text-slate-600">Nguồn: {source}</span>
      </div>
      {assessment.evidence && (
        <p className="text-sm">
          <strong>Dấu hiệu trong câu:</strong> “{assessment.evidence}”
        </p>
      )}
      <p className="text-sm">
        <strong>Lý do:</strong> {assessment.explanation}
      </p>
      <p className="text-xs text-slate-600">
        Nhãn này để bạn kiểm tra trước khi gửi; policy và quyết định xử lý vẫn do hệ thống kiểm tra riêng.
      </p>
    </Card>
  );
}

import type { ReactNode } from "react";
import type { Assistance } from "@/domain/contracts";
export function AnswerBubble({
  item,
  children,
}: {
  item: Assistance;
  children?: ReactNode;
}) {
  return (
    <div className="assistant-reveal" aria-live="polite">
      <article className="assistant-bubble" aria-label="Câu trả lời của trợ lý">
        <p className="assistant-byline">
          ✦{" "}
          {item.source === "openai"
            ? "VNG Support · AI trả lời"
            : item.source === "mock"
              ? "VNG Support · Câu trả lời mẫu"
              : "VNG Support · Hướng dẫn đã kiểm duyệt"}
        </p>
        {item.fallbackReason && !item.answer && (
          <p className="assistant-note" role="status">
            Đang dùng hướng dẫn đã kiểm duyệt vì AI chưa trả về kết quả hợp lệ.
            Bạn vẫn có thể làm theo các bước an toàn hoặc nhờ nhân viên hỗ trợ.
            <span className="block">Mã lý do: {item.fallbackReason}</span>
          </p>
        )}
        {item.answer ? (
          <>
            <div className="assistant-text">{item.answer.text}</div>
            {item.answer.cacheHit && (
              <p className="assistant-note">
                Câu trả lời AI đã lưu, dùng lại trong tối đa một giờ để tiết
                kiệm lượt gọi.
              </p>
            )}
            {item.answer.scopeNotice && (
              <p className="assistant-note">{item.answer.scopeNotice}</p>
            )}
            {item.answer.fallbackReason &&
              item.answer.fallbackReason !== "INTERNAL_POLICY_UNVERIFIED" && (
                <p className="assistant-note">
                  AI đang tạm không sẵn sàng. Đây là hướng dẫn có sẵn; câu hỏi
                  chưa được chuyển cho nhân viên.
                </p>
              )}
            {item.answer.webSearch === "unavailable" && (
              <p className="assistant-note">
                Chưa tra cứu được web mới nhất; nguồn có sẵn được ghi ngày kiểm
                tra bên dưới.
              </p>
            )}
            {item.answer.sources.length > 0 && (
              <details className="assistant-sources">
                <summary>
                  Nguồn tham khảo ({item.answer.sources.length})
                </summary>
                <ul>
                  {item.answer.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                      <span>
                        {" "}
                        ·{" "}
                        {source.scope === "public"
                          ? "Nguồn công khai"
                          : "Tài liệu dự án"}{" "}
                        · kiểm tra {source.checkedAt.slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          children
        )}
      </article>
    </div>
  );
}

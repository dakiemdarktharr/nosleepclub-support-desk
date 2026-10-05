"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GUIDE_SESSION_PREFIX, guideStages, type GuideRole } from "@/domain/judge-guide";
import { GuideIllustration } from "./guide-illustration";
import { usePathname } from "next/navigation";

type Position = { left: number; top: number; width: number; height: number };
type Guide = { stage: string; index: number };
const waitingStages = ["sender-form", "sender-preview", "reviewer-list"];

export function JudgeGuide({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const content = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const tip = useRef<HTMLElement>(null);
  const seen = useRef(new Set<string>());
  const activeRole = useRef<GuideRole | null>(null);
  const lastStage = useRef("");
  const lastTarget = useRef("");
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const remember = useCallback((key: string) => {
    seen.current.add(key);
    try { sessionStorage.setItem(`${GUIDE_SESSION_PREFIX}${key}`, "seen"); }
    catch { /* In-memory state still avoids repeats during SPA navigation. */ }
  }, []);

  useEffect(() => {
    for (const key of ["intro", "sender", "reviewer"]) {
      try {
        if (sessionStorage.getItem(`${GUIDE_SESSION_PREFIX}${key}`) === "seen") seen.current.add(key);
      } catch { /* Storage may be disabled by the browser. */ }
    }
    setIntro(!seen.current.has("intro") && /^\/(send-help|workspace|review|audit|verify|track)(\/|$)/.test(pathname));
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    const open = () => setIntro(true);
    window.addEventListener("vng-open-guide", open);
    return () => window.removeEventListener("vng-open-guide", open);
  }, []);

  const dismissIntro = useCallback(() => {
    remember("intro");
    setIntro(false);
  }, [remember]);

  useEffect(() => {
    if (!ready || !intro) { dialog.current?.close(); return; }
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal?.showModal();
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [ready, intro]);

  // Stages are declared by the rendered page, including asynchronous detail pages.
  // Mark a role on entry: returning from Home never restarts an abandoned tour.
  useEffect(() => {
    if (!ready || intro || !content.current) return;
    const inspect = () => {
      const stage = content.current?.querySelector<HTMLElement>("[data-guide-stage]")?.dataset.guideStage ?? "";
      const definition = guideStages[stage];
      if (!definition) {
        activeRole.current = null;
        lastStage.current = "";
        setGuide(null);
        return;
      }
      if (activeRole.current !== definition.role) {
        if (seen.current.has(definition.role)) { setGuide(null); return; }
        remember(definition.role);
        activeRole.current = definition.role;
        lastStage.current = "";
      }
      if (lastStage.current !== stage) {
        lastStage.current = stage;
        setGuide({ stage, index: 0 });
      }
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(content.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-guide-stage"] });
    return () => observer.disconnect();
  }, [ready, intro, remember]);

  const finish = useCallback(() => {
    activeRole.current = null;
    setGuide(null);
  }, []);
  const next = useCallback(() => {
    if (!guide) return;
    const steps = guideStages[guide.stage].steps;
    if (guide.index + 1 < steps.length) setGuide({ ...guide, index: guide.index + 1 });
    else if (!waitingStages.includes(guide.stage)) finish();
  }, [guide, finish]);

  useEffect(() => {
    if (!guide || !content.current) { setPosition(null); return; }
    let frame = 0;
    const steps = guideStages[guide.stage].steps;
    const measure = () => {
      const index = steps.findIndex((step, index) => {
        if (index < guide.index) return false;
        const target = content.current?.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
        return target && target.getClientRects().length > 0;
      });
      if (index < 0) { setPosition(null); return; }
      if (index !== guide.index) { setGuide({ ...guide, index }); return; }
      const target = content.current!.querySelector<HTMLElement>(`[data-guide="${steps[index].target}"]`)!;
      const identity = `${guide.stage}:${index}`;
      if (lastTarget.current !== identity) {
        lastTarget.current = identity;
        target.scrollIntoView({ block: "center", behavior: "auto" });
      }
      const rect = target.getBoundingClientRect();
      const value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      setPosition((previous) => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
      setViewport((previous) => previous.width === innerWidth && previous.height === innerHeight ? previous : { width: innerWidth, height: innerHeight });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const advance = (event: Event) => {
      const step = steps[guide.index];
      if (event.type !== step.advanceOn || !(event.target instanceof Element)) return;
      if (event instanceof MouseEvent && event.button !== 0) return;
      if (!event.target.closest(`[data-guide="${step.target}"]`)) return;
      if (event.type === "click" && !event.target.closest("button, a, summary")) return;
      if (event.target.closest(":disabled")) return;
      if (event.type === "change" && event.target instanceof HTMLSelectElement &&
          event.target.required && !event.target.value) return;
      if (event.type === "input") {
        if (!(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)) return;
        if (event.target.value.trim().length < (step.target === "reviewer-reason" ? 8 : 2)) return;
      }
      next();
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(content.current, { subtree: true, childList: true, attributes: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(content.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    // Capture before React disables a submitted form for its pending request.
    for (const event of ["click", "input", "change"]) document.addEventListener(event, advance, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      for (const event of ["click", "input", "change"]) document.removeEventListener(event, advance, true);
    };
  }, [guide, next]);

  const step = guide && guideStages[guide.stage].steps[guide.index];
  const dockTop = position ? position.top + Math.min(position.height, 200) / 2 > viewport.height / 2 : false;
  const tipLeft = position ? Math.max(12, Math.min(position.left, viewport.width - 332)) : 12;
  const targetX = position ? Math.max(12, Math.min(viewport.width - 12, position.left + position.width / 2)) : 0;
  const targetY = position ? Math.max(8, Math.min(viewport.height - 8, dockTop ? position.top : position.top + position.height)) : 0;
  const last = guide ? guide.index === guideStages[guide.stage].steps.length - 1 : false;

  return (
    <>
      <div ref={content} inert={intro ? true : undefined}>{children}</div>
      <dialog ref={dialog} className="guide-modal" aria-labelledby="judge-guide-title" onCancel={(event) => { event.preventDefault(); dismissIntro(); }} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, [tabindex="0"]');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <header className="guide-modal-heading">
          <p className="eyebrow">CHÀO MỪNG BAN GIÁM KHẢO</p>
          <h2 id="judge-guide-title">Bắt đầu cùng VNG Support</h2>
          <p>Thử website qua hai vai trò. Mũi tên đỏ sẽ chỉ chỗ cần thao tác.</p>
        </header>
        <div className="guide-modal-scroll" tabIndex={0} aria-label="Nội dung hướng dẫn sử dụng">
          <section>
            <h3>Đăng nhập và cấp ID</h3>
            <p>Trang đầu mặc định Đăng nhập bằng ID đã được IT cấp. Truy cập bằng ID là demo, chưa xác minh danh tính. Chọn “Nhân viên mới?” để gửi họ tên, job và phạm vi quyền; lưu liên kết theo dõi. Chỉ sau khi IT duyệt mới có ID chính thức. Quyền xử lý ID cần OTP qua kênh do IT cấu hình và vai trò riêng.</p>
          </section>
          <section>
            <h3>1. Tôi cần hỗ trợ — trải nghiệm người gửi</h3>
            <p>Chọn <strong>Tôi cần hỗ trợ</strong> ở trang đầu. Chọn phòng ban và nhập mã nhân viên (cả hai đều bắt buộc); mã dùng để liên kết, tra cứu hồ sơ nhưng chưa xác thực danh tính. Viết vấn đề hoặc chọn danh mục, điền thông tin rồi bấm <strong>Gửi</strong>. Ví dụ: “VPN không kết nối”.</p>
            <GuideIllustration kind="sender" />
            <p>Đọc phản hồi, sửa nếu cần rồi bấm <strong>Xác nhận và gửi yêu cầu</strong>. Với câu hỏi trò chuyện, bấm <strong>Lưu và tiếp tục trò chuyện</strong> để mở trang theo dõi.</p>
            <GuideIllustration kind="feedback" />
            <p>Thử A/B/C/D tùy kết quả: đã giải quyết, vẫn lỗi, giải thích thêm hoặc chuyển nhân viên. Có thể hỏi tiếp, bổ sung dữ kiện và mở lịch sử. Lưu liên kết nếu muốn xem lại yêu cầu.</p>
          </section>
          <section>
            <h3>2. Dành cho nhân viên — human reviewer</h3>
            <p>Về trang đầu bằng logo <strong>VNG Support</strong>, chọn <strong>Dành cho nhân viên</strong>. Mở một hồ sơ, đọc bằng chứng và lý do xử lý trước khi quyết định.</p>
            <GuideIllustration kind="reviewer" />
            <p>Nhập lý do cụ thể rồi chọn thao tác được phép: hỏi thêm, duyệt, từ chối, dừng hoặc điều chỉnh. Nút bị mờ nghĩa là chưa đủ điều kiện. Kiểm tra <strong>Lịch sử xử lý</strong> để đối chiếu kết quả.</p>
            <p>Nếu danh sách trống, tạo yêu cầu demo trước. Có thể thử “Mở port 3389 public” để xem luồng cần nhân viên; yêu cầu rủi ro không được duyệt tùy tiện.</p>
          </section>
          <section className="guide-note">
            <h3>Mẹo khi kiểm tra</h3>
            <p>Trang <strong>Kiểm thử</strong> dành cho các case Verify; chọn nguồn Case Verify trong bộ lọc nếu muốn tìm chúng. Đây là demo mô phỏng, không cấp quyền hay thay đổi hạ tầng thật. Chỉ dùng dữ liệu minh họa.</p>
            <p>Hướng dẫn mỗi vai trò chỉ hiện lần đầu trong tab này. Quay lại vai trò sẽ không lặp lại; đóng tab và mở link trong tab mới để bắt đầu lại.</p>
          </section>
        </div>
        <div className="guide-modal-footer"><button className="button primary" onClick={dismissIntro}>Đã hiểu</button></div>
      </dialog>
      {ready && !intro && guide && step && position && (
        <div className="guide-overlay">
          <div className="guide-target-ring" style={{ left: position.left - 4, top: position.top - 4, width: position.width + 8, height: position.height + 8 }} />
          <svg className="guide-arrow" aria-hidden="true" width={viewport.width} height={viewport.height}>
            <defs><marker id="live-guide-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" /></marker></defs>
            <path d={`M ${tipLeft + 160} ${dockTop ? 12 + (tip.current?.offsetHeight ?? 210) : viewport.height - 12 - (tip.current?.offsetHeight ?? 210)} Q ${targetX + 45} ${targetY + (dockTop ? -50 : 50)} ${targetX} ${targetY}`} stroke="#dc2626" strokeWidth="4" fill="none" strokeLinecap="round" markerEnd="url(#live-guide-arrow)" />
          </svg>
          <aside ref={tip} className="guide-tip" role="region" aria-label="Hướng dẫn thao tác" style={{ left: tipLeft, ...(dockTop ? { top: 12 } : { bottom: 12 }) }}>
            <p className="eyebrow">{guideStages[guide.stage].role === "sender" ? "NGƯỜI GỬI" : "HUMAN REVIEWER"}</p>
            <div aria-live="polite"><h3>{step.title}</h3><p>{step.text}</p></div>
            <div className="guide-tip-actions">
              {(!last || !waitingStages.includes(guide.stage)) && <button className="button primary" onClick={next}>{last ? "Hoàn tất hướng dẫn" : "Tiếp theo"}</button>}
              <button className="guide-skip" onClick={finish}>Bỏ qua hướng dẫn</button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

import { ContentSkeleton } from "@/components/loading-feedback";

export default function Loading() {
  return <main className="page page-narrow" data-guide-loading><ContentSkeleton label="Đang mở trang…" /></main>;
}

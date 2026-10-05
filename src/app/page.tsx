import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Headphones, ClipboardList } from "lucide-react";
import { LoginPanel } from "@/components/identity-ui";
export default function Home() {
  return (
    <main className="welcome account-welcome" aria-label="Đăng nhập hoặc khám phá VNG Support">
      <LoginPanel />
      <section className="welcome-copy">
        <h2>
          Bạn cần hỗ trợ
          <br />
          gì hôm nay?
        </h2>
        <p>Dùng thử các luồng hỗ trợ và Verify bằng dữ liệu giả lập, không cần tài khoản.</p>
        <div className="entry-links">
          <Link
            aria-label="Tôi cần hỗ trợ"
            className="entry-card entry-primary"
            href="/send-help"
          >
            <Headphones size={25} />
            <span>
              <strong>Tôi cần hỗ trợ</strong>
              <small>Demo gửi vấn đề và nhận hướng dẫn</small>
            </span>
            <ArrowRight size={22} />
          </Link>
          <Link
            aria-label="Dành cho nhân viên"
            className="entry-card"
            href="/review"
          >
            <ClipboardList size={24} />
            <span>
              <strong>Dành cho nhân viên</strong>
              <small>Tiếp nhận và xử lý yêu cầu hỗ trợ</small>
            </span>
            <ArrowRight size={22} />
          </Link>
        </div>
      <div className="welcome-art">
        <span className="hello-note" aria-hidden="true">
          Xin chào!
        </span>
        <Image
          src="/illustrations/vng-support-mascot.png"
          width={1024}
          height={1024}
          priority
          alt="Nhân vật màu cam thân thiện đang vẫy tay chào"
        />
      </div>
      </section>
    </main>
  );
}

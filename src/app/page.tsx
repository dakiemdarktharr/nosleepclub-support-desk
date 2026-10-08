import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Headphones, ClipboardList } from "lucide-react";

export default function Home() {
  return (
    <main className="welcome role-welcome" aria-label="Chọn vai trò">
      <section className="welcome-copy">
        <h1>Bạn cần hỗ trợ<br />gì hôm nay?</h1>
        <div className="entry-links">
          <Link aria-label="Tôi cần hỗ trợ" className="entry-card entry-primary" href="/login">
            <span className="entry-icon"><Headphones size={28} /></span>
            <strong>Tôi cần hỗ trợ</strong>
            <ArrowRight size={24} aria-hidden="true" />
          </Link>
          <Link aria-label="Dành cho nhân viên" className="entry-card" href="/review">
            <span className="entry-icon"><ClipboardList size={27} /></span>
            <strong>Dành cho nhân viên</strong>
            <ArrowRight size={24} aria-hidden="true" />
          </Link>
        </div>
        <Link className="button secondary guest-entry" href="/guest">Đăng nhập không cần tài khoản</Link>
      </section>
      <div className="welcome-art">
        <span className="mascot-orbit" aria-hidden="true" />
        <span className="hello-note" aria-hidden="true">Xin chào!</span>
        <Image src="/illustrations/vng-support-mascot.png" width={1024} height={1024}
          priority alt="Nhân vật màu cam thân thiện đang vẫy tay chào" />
      </div>
    </main>
  );
}

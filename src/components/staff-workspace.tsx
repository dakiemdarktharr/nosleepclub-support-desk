import type { ReactNode } from "react";
import Link from "next/link";
import { FlaskConical, Inbox, ShieldCheck } from "lucide-react";

type StaffSection = "review" | "audit" | "verify";

const navigation: Array<{
  href: "/review" | "/audit" | "/verify";
  section: StaffSection;
  label: string;
  icon: typeof Inbox;
}> = [
  { href: "/review", section: "review", label: "Yêu cầu cần xử lý", icon: Inbox },
  { href: "/audit", section: "audit", label: "Lịch sử xử lý", icon: ShieldCheck },
  { href: "/verify", section: "verify", label: "Kiểm thử", icon: FlaskConical },
];

export function StaffWorkspace({
  active,
  children,
}: {
  active: StaffSection;
  children: ReactNode;
}) {
  return (
    <div className="it-workspace">
      <aside className="it-rail" aria-label="Không gian IT">
        <div className="it-rail-title">
          <Inbox size={22} />
          <strong>Không gian IT</strong>
        </div>
        <p>Tiếp nhận và xử lý hỗ trợ</p>
        <nav aria-label="Điều hướng hỗ trợ">
          {navigation.map(({ href, section, label, icon: Icon }) => (
            <Link
              key={section}
              href={href}
              aria-current={active === section ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="it-demo-note">
          <ShieldCheck size={18} />
          <span>
            Môi trường mô phỏng
            <br />
            Mọi quyết định đều có nhật ký.
          </span>
        </div>
      </aside>
      {children}
    </div>
  );
}

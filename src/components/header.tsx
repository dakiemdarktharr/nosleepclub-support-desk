"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files } from "lucide-react";
import { SiteAccess } from "./site-access";
export function Header() {
  const path = usePathname();
  const staff = /^\/(review|audit|verify)/.test(path);
  return (
    <header className={`site-header${staff ? " it-header" : ""}`}>
      <SiteAccess />
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Files size={23} />
        </span>
        VNG Support
      </Link>
      {path !== "/" && path !== "/review" && (
        <nav aria-label="Điều hướng chính">
          {staff ? (
            <>
              <Link
                href="/review"
                aria-current={path === "/review" ? "page" : undefined}
              >
                Yêu cầu cần xử lý
              </Link>
              <Link
                href="/audit"
                aria-current={path === "/audit" ? "page" : undefined}
              >
                Lịch sử xử lý
              </Link>
              <Link
                href="/verify"
                aria-current={path === "/verify" ? "page" : undefined}
              >
                Kiểm thử
              </Link>
            </>
          ) : (
            <>
              <Link href="/send-help" aria-current={path === "/send-help" || path === "/workspace" ? "page" : undefined}>Gửi yêu cầu</Link>
              <Link href="/track" aria-current={path === "/track" ? "page" : undefined}>Theo dõi yêu cầu</Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

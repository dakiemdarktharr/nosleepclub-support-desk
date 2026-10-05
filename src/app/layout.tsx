import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/header";
import { JudgeGuide } from "@/components/judge-guide";
import { RouteTransition } from "@/components/route-transition";
import "./globals.css";

const nunito = localFont({
  src: "./fonts/Nunito.ttf",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});
export const metadata: Metadata = {
  title: "VNG Support | Trợ lý hỗ trợ",
  description:
    "Trò chuyện, giải đáp câu hỏi thường ngày và hỗ trợ kỹ thuật với AI, nguồn tham khảo và quy trình xử lý rõ ràng.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={nunito.variable}>
      <body>
        <JudgeGuide>
          <Header />
          <RouteTransition>{children}</RouteTransition>
        </JudgeGuide>
      </body>
    </html>
  );
}

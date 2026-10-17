"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input } from "@/components/ui";
import { GuestRequestHistory } from "@/components/guest-request-history";
export default function TrackPage() {
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  const router = useRouter();
  return (
    <main className="page page-narrow">
      <h1>Theo dõi yêu cầu</h1>
      <GuestRequestHistory />
      <Card>
        <p>Dán liên kết theo dõi hoặc mã đầy đủ đã nhận sau khi gửi.</p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const id = value
              .trim()
              .match(
                /(?:^|\/requests\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:$|[?#])/i,
              )?.[1];
            if (id) router.push(`/requests/${id.toLowerCase()}`);
            else
              setError(
                "Cần liên kết theo dõi hoặc mã đầy đủ; mã ngắn trên màn hình chỉ dùng để nhận biết.",
              );
          }}
        >
          <label>
            Liên kết hoặc mã yêu cầu
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              required
            />
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button>Theo dõi</Button>
        </form>
      </Card>
    </main>
  );
}

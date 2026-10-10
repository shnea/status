import type { Metadata } from "next";
import { AdminConsole } from "@/features/admin/AdminConsole";

export const metadata: Metadata = {
  title: "관리자 · 상태창",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminConsole />;
}

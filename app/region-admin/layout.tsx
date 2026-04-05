import type { ReactNode } from "react";
import { redirect } from "next/navigation";

interface RegionAdminLayoutProps {
  children: ReactNode;
}

export default function RegionAdminLayout(_props: RegionAdminLayoutProps) {
  redirect("/leadership");
}

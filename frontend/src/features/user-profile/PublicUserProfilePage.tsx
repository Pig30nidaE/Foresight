"use client";

import { useParams } from "next/navigation";

import PublicUserProfileView from "@/features/user-profile/PublicUserProfileView";

export default function PublicUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const id = params?.userId ?? "";
  return <PublicUserProfileView key={id} />;
}

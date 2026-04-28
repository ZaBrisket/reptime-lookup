import { getData } from "@/lib/server-data";
import HomeView from "@/components/HomeView";
import { Suspense } from "react";

export default function Page() {
  const state = getData();
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <HomeView state={state} />
    </Suspense>
  );
}

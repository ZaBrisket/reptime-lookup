import { getData } from "@/lib/server-data";
import HomeView from "@/components/HomeView";

export default function Page() {
  const state = getData();
  return <HomeView state={state} />;
}

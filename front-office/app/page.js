import { redirect } from "next/navigation";

// The site opens on the dashboard. The prospect board lives at /prospects; older prospect links
// (/?p=…, /?view=…) are forwarded there with their query intact.
const PROSPECT_KEYS = ["p", "view", "class", "pos"];

export default function Home({ searchParams = {} }) {
  if (PROSPECT_KEYS.some((k) => k in searchParams)) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) [].concat(v).forEach((x) => q.append(k, x));
    redirect(`/prospects?${q}`);
  }
  redirect("/dashboard");
}

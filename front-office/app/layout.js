import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Front Office",
  description: "Dynasty command center for your Sleeper league",
};

// Applied before paint so the saved theme never flashes the wrong colors.
const themeScript = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t||"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

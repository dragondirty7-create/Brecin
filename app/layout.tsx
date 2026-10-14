import type { Metadata, Viewport } from "next";
import "./globals.css";
import LaunchSplash from "../components/LaunchSplash";
import { LAUNCH_KEY } from "../lib/launch";

export const metadata: Metadata = {
  title: "Project Presser",
  description: "Project Presser: private construction lead board for Michael and Brendan. Back to the fun.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1ea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before first paint: skip the launch screen if it already played this visit. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem(${JSON.stringify(LAUNCH_KEY)}))document.documentElement.dataset.splash="skip"}catch(e){}`,
          }}
        />
      </head>
      <body>
        <LaunchSplash />
        {children}
      </body>
    </html>
  );
}

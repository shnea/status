import type { Metadata } from "next";
import { siteSettings } from "@/lib/site-api";
import { SiteProvider } from "@/features/site/SiteContext";
import "./globals.css";
import "@shnea/editor/style.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await siteSettings();

  return {
    title: { default: site.serviceName, template: "%s · " + site.serviceName },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const site = await siteSettings();

  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#content">
          본문으로 건너뛰기
        </a>
        <SiteProvider value={site}>{children}</SiteProvider>
      </body>
    </html>
  );
}

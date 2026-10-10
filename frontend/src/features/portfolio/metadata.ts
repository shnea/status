import type { Metadata } from "next";
import { defaultSiteSettings, type PublicSiteSettings } from "@/features/site/model";
import type { Project, PublicPortfolio } from "./model";

export function publicMetadata(
  portfolio: PublicPortfolio,
  project?: Project,
  site: PublicSiteSettings = defaultSiteSettings,
): Metadata {
  const name = portfolio.document.profile.name;
  const title = project ? project.title + " · " + name : name;

  const description = project
    ? project.summary || project.title
    : portfolio.document.profile.introduction || name + "의 포트폴리오";

  const path = "/@" + portfolio.slug + (project ? "/projects/" + project.id : "");
  const imageId = project?.imageId || portfolio.document.profile.imageId;

  const image = {
    url: imageId
      ? "/api/public/files/" + portfolio.id + "/" + imageId + "/content/preview"
      : site.shareImageUrl,
    alt: title,
  };

  return {
    title,
    description,
    metadataBase: new URL(process.env.APP_PUBLIC_URL || "http://localhost:30165"),
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: site.serviceName,
      title,
      description,
      url: path,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

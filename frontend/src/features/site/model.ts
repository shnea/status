export interface SiteConfiguration {
  serviceName: string;
  announcement: string;
  announcementEnabled: boolean;
  shareImageId: string | null;
  imageMaxMiB: number;
  attachmentMaxMiB: number;
}

export interface PublicSiteSettings {
  serviceName: string;
  announcement: string;
  shareImageUrl: string;
  imageMaxMiB: number;
  attachmentMaxMiB: number;
}

export const defaultSiteSettings: PublicSiteSettings = {
  serviceName: "상태창",
  announcement: "",
  shareImageUrl: "/share-default.png",
  imageMaxMiB: 10,
  attachmentMaxMiB: 10,
};

import Hls from "hls.js";
import type { AttachmentViews } from "@shnea/editor";

export function mountVideo(element: HTMLElement, initial: AttachmentViews) {
  const doc = element.ownerDocument;
  const video = doc.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.style.width = "100%";
  video.setAttribute("aria-label", "첨부 영상");
  const message = doc.createElement("p");
  message.setAttribute("role", "status");
  const download = doc.createElement("a");
  download.textContent = "원본 다운로드";
  element.append(video, message, download);
  let source = "";
  let hls: Hls | null = null;
  let disposed = false;

  function failed() {
    message.textContent = "영상을 재생하지 못했습니다. 보기 정보를 다시 조회해주세요.";
  }

  video.addEventListener("error", failed);

  function update(data: AttachmentViews) {
    if (disposed) return;
    download.href = data.downloadUrl;

    if (!data.streamUrl || data.streamUrl === source) return;
    const url = new URL(data.streamUrl, doc.baseURI);

    if (url.origin !== new URL(doc.baseURI).origin) {
      failed();

      return;
    }

    source = data.streamUrl;
    message.textContent = "";
    hls?.destroy();

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
    } else if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, backBufferLength: 30 });
      hls.on(Hls.Events.ERROR, (_, error) => {
        if (error.fatal) {
          hls?.stopLoad();
          failed();
        }
      });
      hls.loadSource(source);
      hls.attachMedia(video);
    } else {
      message.textContent = "이 브라우저는 영상 재생을 지원하지 않습니다. 원본을 내려받아 주세요.";
    }

    for (const track of video.querySelectorAll("track")) track.remove();

    if (data.video?.subtitles?.mode === "sidecar" && data.subtitleUrls?.["subtitles.vtt"]) {
      const track = doc.createElement("track");
      track.kind = "captions";
      track.label = "자동 자막";
      track.srclang =
        data.video.subtitles.language === "auto" ? "und" : data.video.subtitles.language;
      track.src = data.subtitleUrls["subtitles.vtt"];
      video.append(track);
    }
  }

  update(initial);

  return {
    update,
    destroy() {
      disposed = true;
      hls?.destroy();
      video.removeEventListener("error", failed);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      message.remove();
      download.remove();
    },
  };
}

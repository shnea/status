import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const output = process.env.SHARE_OUTPUT || "/output";

await mkdir(output, { recursive: true });

const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f6f0;color:#191919;font-family:"Noto Sans CJK KR","Noto Sans CJK JP",sans-serif}
    main{width:1200px;height:630px;padding:52px 64px;display:flex;flex-direction:column}
    header{border-bottom:2px solid #191919;padding-bottom:22px;font-size:32px;font-weight:700;letter-spacing:-2px}
    h1{font-size:98px;line-height:1.2;font-weight:700;letter-spacing:-7px;margin:60px 0 auto}
    footer{display:flex;align-items:center;justify-content:space-between;font-size:20px}
    .mark{width:52px;height:10px;background:#b44228}
  </style><main><header>상태창</header><h1>나를 보여주는<br>하나의 창.</h1><footer><span class="mark"></span><span>status.shnea.kr</span></footer></main></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output + "/share-default.png" });
} finally {
  await browser.close();
}

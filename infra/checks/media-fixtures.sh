#!/bin/sh
set -eu
mkdir -p /artifacts/media
ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=white:s=320x180:r=12 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 2 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -profile:v baseline -g 12 -c:a aac -movflags +faststart /artifacts/media/clip.mp4
ffmpeg -hide_banner -loglevel error -y -i /artifacts/media/clip.mp4 -c copy -hls_time 1 -hls_list_size 0 -hls_segment_filename /artifacts/media/q360-%05d.ts /artifacts/media/q360.m3u8
printf '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=320x180\nq360.m3u8\n' > /artifacts/media/master.m3u8
ffmpeg -hide_banner -loglevel error -y -f lavfi -i sine=frequency=440:sample_rate=8000 -t 1 -c:a pcm_s16le /artifacts/media/clip.wav
node <<'JS'
const fs = require('node:fs');
const content = 'BT /F1 18 Tf 60 740 Td (File preview fixture) Tj ET';
const objects = [
'<< /Type /Catalog /Pages 2 0 R >>',
'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
'<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream'
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => {
 offsets.push(Buffer.byteLength(pdf));
 pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
});
const start = Buffer.byteLength(pdf);
pdf += 'xref\n0 6\n0000000000 65535 f \n';
for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n';
fs.writeFileSync('/artifacts/media/fixture.pdf', pdf);
fs.writeFileSync('/artifacts/media/fixture.md', '한글 첨부 문서\n<script>alert("fixture")</script>\n');
JS

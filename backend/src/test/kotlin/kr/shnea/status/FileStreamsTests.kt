package kr.shnea.status

import com.sun.net.httpserver.HttpServer
import kr.shnea.status.config.AppSettings
import kr.shnea.status.files.FileStreams
import kr.shnea.status.files.FileTypes
import kr.shnea.status.files.PlatformFiles
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FileStreamsTests {
    @Test
    fun playlistsKeepEveryAssetWithinTheAuthorizedFileAndStripPlatformTickets() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val id = UUID.randomUUID()
        var playlist = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000\nq360.m3u8?token=fixture-ticket\n"
        var calls = 0
        var receivedRange: String? = null
        server.createContext("/api/v1/files/$id/hls/") { exchange ->
            calls++
            assertEquals("fixture-key", exchange.requestHeaders.getFirst("X-Platform-Key"))
            receivedRange = exchange.requestHeaders.getFirst("Range")
            val segment = exchange.requestURI.path.endsWith(".ts")
            val bytes = if (segment) "part".toByteArray() else playlist.toByteArray()
            exchange.responseHeaders.set("Content-Type", if (segment) "video/mp2t" else "application/vnd.apple.mpegurl")
            exchange.sendResponseHeaders(if (segment) 206 else 200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val origin = "http://127.0.0.1:" + server.address.port
            val settings = AppSettings("local", "http://localhost:30165", origin, UUID.randomUUID(),
                UUID.randomUUID(), "fixture-key", "https://issuer.example.test", "http://localhost:30165/callback",
                "http://localhost:30165/", secureCookie = false)
            val streams = FileStreams(PlatformFiles(settings, JsonMapper.builder().build()), settings)
            val base = "/api/public/files/" + UUID.randomUUID() + "/$id/hls/"
            val result = String(streams.content(id, "master.m3u8", null, base).bytes)
            assertTrue(result.contains(base + "q360.m3u8"))
            assertFalse(result.contains("fixture-ticket"))
            playlist = "#EXTM3U\n/api/v1/files/$id/hls/q360.m3u8?token=fixture-ticket\n"
            assertTrue(String(streams.content(id, "master.m3u8", null, base).bytes).contains(base + "q360.m3u8"))
            val segment = streams.content(id, "q360-00000.ts", "bytes=0-3", base)
            assertEquals(206, segment.status)
            assertEquals("bytes=0-3", receivedRange)
            assertEquals("part", String(segment.bytes))
            playlist = "#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI=\"$origin/api/v1/files/$id/hls/subtitles.vtt?token=fixture-ticket\"\n"
            assertTrue(String(streams.content(id, "master.m3u8", null, base).bytes).contains("URI=\"" + base + "subtitles.vtt\""))
            for (foreign in listOf("../q360.m3u8", "//foreign.example/q360.m3u8", "https://foreign.example/q360.m3u8",
                "$origin/api/v1/files/${UUID.randomUUID()}/hls/q360.m3u8", "malformed uri.m3u8")) {
                playlist = "#EXTM3U\n$foreign\n"
                assertFailsWith<ResponseStatusException> { streams.content(id, "master.m3u8", null, base) }
            }
            val before = calls
            assertFailsWith<IllegalArgumentException> { streams.content(id, "../secret", null, base) }
            assertFailsWith<IllegalArgumentException> { streams.content(id, "q360-00000.ts", "bytes=0-3,8-9", base) }
            assertEquals(before, calls)
        } finally { server.stop(0) }
    }

    @Test
    fun attachmentAllowListUsesActualBytesAndRejectsActiveMarkupAndDisguisedBinaryFiles() {
        assertEquals("application/pdf", FileTypes.mediaType("resume.pdf", "file", "%PDF-1.7\n".toByteArray()))
        assertEquals("text/markdown", FileTypes.mediaType("notes.md", "file", "한글 문서".toByteArray()))
        assertEquals("audio/wav", FileTypes.mediaType("clip.wav", "audio", "RIFF0000WAVE".toByteArray()))
        assertFailsWith<IllegalArgumentException> { FileTypes.mediaType("icon.svg", "file", "<svg/>".toByteArray()) }
        assertFailsWith<IllegalArgumentException> { FileTypes.mediaType("page.html", "file", "<html/>".toByteArray()) }
        assertFailsWith<IllegalArgumentException> { FileTypes.mediaType("clip.mp4", "video", "not a video".toByteArray()) }
        assertFailsWith<IllegalArgumentException> { FileTypes.mediaType("clip.mp3", "video", "ID3data".toByteArray()) }
        assertFailsWith<IllegalArgumentException> { FileTypes.mediaType("notes.txt", "file", byteArrayOf(-1, -1)) }
    }
}

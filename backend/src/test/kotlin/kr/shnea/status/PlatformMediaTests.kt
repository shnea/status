package kr.shnea.status

import kr.shnea.status.config.AppSettings
import kr.shnea.status.files.FileStreams
import kr.shnea.status.files.FileTypes
import kr.shnea.status.files.PlatformFiles
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlatformMediaTests {
    @Test
    fun actualPlatformMediaStaysPrivateAndOffersWorkingPdfAudioAndVideoAssets() {
        assumeTrue(System.getenv("RUN_PLATFORM_MEDIA_TEST") == "1", "Actual platform media is explicitly opt-in")
        val settings = AppSettings("local", "http://localhost:30165", requireNotNull(System.getenv("PLATFORM_BASE_URL")),
            UUID.fromString(System.getenv("PLATFORM_PROJECT_ID")), UUID.fromString(System.getenv("PLATFORM_ENVIRONMENT_ID")),
            requireNotNull(System.getenv("PLATFORM_API_KEY")), "https://issuer.example.test", "http://localhost:30165/callback",
            "http://localhost:30165/", secureCookie = false, fileRetentionCode = requireNotNull(System.getenv("PLATFORM_FILE_RETENTION_CODE")))
        val platform = PlatformFiles(settings, JsonMapper.builder().build())
        val streams = FileStreams(platform, settings)
        val root = Path.of(requireNotNull(System.getenv("TEST_MEDIA_DIR"))).toAbsolutePath().normalize()
        val generated = mutableListOf<UUID>()
        try {
            for ((name, kind, expected) in listOf(Triple("fixture.pdf", "file", "PDF"), Triple("clip.wav", "audio", "AUDIO"),
                Triple("fixture.md", "file", "MARKDOWN"), Triple("clip.mp4", "video", "VIDEO"))) {
                val path = root.resolve(name).normalize()
                require(path.startsWith(root))
                val bytes = Files.readAllBytes(path)
                require(bytes.size in 1..(10 * 1024 * 1024))
                FileTypes.mediaType(name, kind, bytes)
                val id = platform.upload(UUID.randomUUID(), name, bytes, PlatformFiles.hash(bytes))
                generated.add(id)
                var views = platform.views(id)
                var attempts = 0
                while (attempts < 180 && (views.get("state").asString() in setOf("QUEUED", "PROCESSING")
                    || kind == "video" && views.get("video")?.get("state")?.asString() in setOf("QUEUED", "PROCESSING"))) {
                    Thread.sleep(1000)
                    views = platform.views(id)
                    attempts++
                }
                assertEquals(expected, views.get("kind").asString())
                assertEquals("READY", views.get("state").asString())
                val original = platform.content(id, "original", null)
                assertEquals(200, original.status)
                assertEquals(PlatformFiles.hash(bytes), PlatformFiles.hash(original.bytes))
                if (kind == "video") {
                    assertTrue(views.get("streamUrl")?.isString == true)
                    val base = "/api/files/$id/hls/"
                    val observed = String(platform.hls(id, "master.m3u8", null).bytes)
                    for (line in observed.lineSequence().filter { it.isNotBlank() && !it.startsWith("#") }) {
                        val uri = java.net.URI(line.trim())
                        println("Actual HLS shape: absolute=" + uri.isAbsolute + ", rooted=" + uri.path.startsWith("/") +
                            ", same-file=" + uri.path.startsWith("/api/v1/files/$id/hls/") + ", query=" + (uri.rawQuery != null))
                    }
                    val master = String(streams.content(id, "master.m3u8", null, base).bytes)
                    assertTrue(master.startsWith("#EXTM3U"))
                    assertFalse(master.contains("token="))
                    val playlist = master.lineSequence().first { it.isNotBlank() && !it.startsWith("#") }.removePrefix(base)
                    val media = String(streams.content(id, playlist, null, base).bytes)
                    val segment = media.lineSequence().first { it.isNotBlank() && !it.startsWith("#") }.removePrefix(base)
                    assertTrue(streams.content(id, segment, null, base).bytes.isNotEmpty())
                } else {
                    assertTrue(views.get("previewUrl")?.isString == true)
                    assertTrue(platform.content(id, "preview", null).bytes.isNotEmpty())
                }
                println("Actual media verified: $expected")
            }
        } finally {
            var failures = 0
            for (id in generated) {
                try { platform.delete(id) } catch (_: Exception) { failures++ }
            }
            assertEquals(0, failures, "Generated media cleanup failed")
        }
    }
}

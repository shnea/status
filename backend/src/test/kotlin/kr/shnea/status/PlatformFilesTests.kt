package kr.shnea.status

import com.sun.net.httpserver.HttpServer
import kr.shnea.status.config.AppSettings
import kr.shnea.status.files.PlatformFiles
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlatformFilesTests {
    @Test
    fun privateUploadResumesWithExactOffsetsAndPreservesContentVariants() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val json = JsonMapper.builder().build()
        val uploadId = UUID.randomUUID()
        val fileId = UUID.randomUUID()
        val bytes = "0123456789ABCDEFGHIJ".toByteArray()
        val sha = PlatformFiles.hash(bytes)
        val received = mutableListOf<Byte>()
        val variants = mutableListOf<String>()
        var complete = false
        var creates = 0
        var privateRequests = true
        var exactOffsets = true
        server.createContext("/api/v1/files") { exchange ->
            val path = exchange.requestURI.path
            privateRequests = privateRequests && exchange.requestHeaders.getFirst("X-Platform-Key") == "test-key"
            var status = 200
            var response = ByteArray(0)
            fun upload(): ByteArray = json.writeValueAsBytes(mapOf("uploadId" to uploadId,
                "state" to if (complete) "READY" else "UPLOADING", "receivedBytes" to received.size,
                "maxChunkBytes" to 8, "fileId" to if (complete) fileId else null))
            when {
                path == "/api/v1/files/uploads" -> {
                    creates += 1
                    val body = json.readTree(exchange.requestBody.readAllBytes())
                    privateRequests = privateRequests && body.get("visibility").asString() == "PRIVATE"
                        && body.get("retentionCode").asString() == "영구" && body.get("sha256").asString() == sha
                    response = upload()
                    status = 201
                }
                path == "/api/v1/files/uploads/$uploadId" -> {
                    val chunk = exchange.requestBody.readAllBytes()
                    exactOffsets = exactOffsets && exchange.requestHeaders.getFirst("Upload-Offset") == received.size.toString()
                        && exchange.requestHeaders.getFirst("X-Chunk-SHA256") == PlatformFiles.hash(chunk) && chunk.size <= 8
                    received.addAll(chunk.toList())
                    response = upload()
                }
                path == "/api/v1/files/uploads/$uploadId/complete" -> {
                    complete = true
                    response = json.writeValueAsBytes(mapOf("fileId" to fileId, "visibility" to "PRIVATE",
                        "sha256" to sha, "size" to bytes.size, "retentionCode" to "영구"))
                }
                path.startsWith("/api/v1/files/$fileId/content/") -> {
                    val variant = path.substringAfterLast('/')
                    variants.add(variant)
                    exchange.responseHeaders.set("Content-Type", "image/png")
                    response = variant.toByteArray()
                }
            }
            exchange.sendResponseHeaders(status, response.size.toLong())
            exchange.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            // Only this in-container protocol fixture uses HTTP; managed deployment settings require HTTPS.
            val settings = AppSettings("local", "http://localhost:30165", "http://127.0.0.1:${server.address.port}",
                UUID.randomUUID(), UUID.randomUUID(), "test-key", "https://issuer.example.test",
                "http://localhost:30165/callback", "http://localhost:30165/", secureCookie = false)
            val platform = PlatformFiles(settings, json)
            val requestId = UUID.randomUUID()
            assertEquals(fileId, platform.upload(requestId, "test.png", bytes, sha))
            assertEquals(bytes.toList(), received)
            assertTrue(exactOffsets)
            assertTrue(privateRequests)
            assertEquals(fileId, platform.upload(requestId, "test.png", bytes, sha))
            assertEquals(2, creates)
            assertEquals(bytes.size, received.size)
            for (variant in listOf("preview", "thumbnail", "original", "download")) {
                assertEquals(variant, platform.content(fileId, variant, null).bytes.toString(Charsets.UTF_8))
            }
            assertEquals(listOf("preview", "thumbnail", "original", "download"), variants)
        } finally {
            server.stop(0)
        }
    }
}

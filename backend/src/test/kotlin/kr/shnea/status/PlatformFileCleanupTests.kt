package kr.shnea.status

import com.sun.net.httpserver.HttpServer
import kr.shnea.status.config.AppSettings
import kr.shnea.status.files.PlatformFiles
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PlatformFileCleanupTests {
    @Test
    fun deletionChecksExistenceBeforeDeleteAndConfirms204() = withServer { server, requests, file, platform ->
        server.createContext("/api/v1/files/$file") { exchange ->
            requests.add(exchange.requestMethod)
            if (exchange.requestMethod == "GET") {
                val body = """{"fileId":"$file"}""".toByteArray()
                exchange.sendResponseHeaders(200, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            } else {
                exchange.sendResponseHeaders(204, -1)
                exchange.close()
            }
        }
        platform.deleteUnused(file)
        assertEquals(listOf("GET", "DELETE"), requests)
    }

    @Test
    fun uncertainDeleteIsReconciledByReadBeforeAnyFurtherMutation() = withServer { server, requests, file, platform ->
        var deleted = false
        server.createContext("/api/v1/files/$file") { exchange ->
            requests.add(exchange.requestMethod)
            when {
                deleted -> {
                    val body = """{"code":"FILE_NOT_FOUND"}""".toByteArray()
                    exchange.sendResponseHeaders(404, body.size.toLong())
                    exchange.responseBody.use { it.write(body) }
                }
                exchange.requestMethod == "DELETE" -> {
                    deleted = true
                    // The service removed the original but its success response never reached the caller.
                    exchange.close()
                }
                else -> {
                    val body = """{"fileId":"$file"}""".toByteArray()
                    exchange.sendResponseHeaders(200, body.size.toLong())
                    exchange.responseBody.use { it.write(body) }
                }
            }
        }
        assertFailsWith<org.springframework.web.server.ResponseStatusException> { platform.deleteUnused(file) }
        platform.deleteUnused(file)
        assertEquals(listOf("GET", "DELETE", "GET"), requests)
    }

    @Test
    fun unknown404AndPermissionFailuresAreNotTreatedAsSuccessfulDeletion() {
        for (status in listOf(403, 404)) withServer { server, requests, file, platform ->
            server.createContext("/api/v1/files/$file") { exchange ->
                requests.add(exchange.requestMethod)
                val body = """{"code":"FILE_ACCESS_DENIED"}""".toByteArray()
                exchange.sendResponseHeaders(status, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            assertFailsWith<org.springframework.web.server.ResponseStatusException> { platform.deleteUnused(file) }
            assertEquals(listOf("GET"), requests)
        }
    }

    private fun withServer(test: (HttpServer, MutableList<String>, UUID, PlatformFiles) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val file = UUID.randomUUID()
        val requests = mutableListOf<String>()
        // Constructed only for the local HTTP fixture; production settings still require HTTPS.
        val settings = AppSettings("local", "http://localhost:30165", "http://127.0.0.1:" + server.address.port,
            UUID.randomUUID(), UUID.randomUUID(), "test-only-key", "https://issuer.example.test",
            "http://localhost:30165/callback", "http://localhost:30165/", secureCookie = false)
        server.start()
        try { test(server, requests, file, PlatformFiles(settings, JsonMapper.builder().build())) }
        finally { server.stop(0) }
    }
}

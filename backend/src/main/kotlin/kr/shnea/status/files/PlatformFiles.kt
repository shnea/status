package kr.shnea.status.files

import kr.shnea.status.config.AppSettings
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import java.io.IOException
import java.security.MessageDigest

data class PlatformUpload(val uploadId: UUID, val state: String, val receivedBytes: Long, val maxChunkBytes: Int, val fileId: UUID?)

@Service
class PlatformFiles(private val settings: AppSettings, private val json: JsonMapper) {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER).build()

    fun upload(requestId: UUID, name: String, bytes: ByteArray, sha: String): UUID {
        val payload = mapOf("requestId" to requestId, "originalName" to name, "size" to bytes.size,
            "sha256" to sha, "visibility" to "PRIVATE", "retentionCode" to settings.fileRetentionCode)
        var current = uploadState(parse(send("POST", "/files/uploads", json.writeValueAsBytes(payload))))
        if (current.state == "READY") return requireNotNull(current.fileId)
        require(current.state == "UPLOADING" && current.receivedBytes in 0..bytes.size.toLong()) { "업로드가 만료되었습니다. 새 파일 요청으로 다시 시도해주세요." }
        while (current.receivedBytes < bytes.size) {
            val from = current.receivedBytes.toInt()
            val count = minOf(current.maxChunkBytes, 8388608, bytes.size - from)
            require(count > 0) { "파일 서비스의 업로드 크기를 확인해주세요." }
            val chunk = bytes.copyOfRange(from, from + count)
            val next = uploadState(parse(send("PATCH", "/files/uploads/${current.uploadId}", chunk,
                mapOf("Upload-Offset" to from.toString(), "X-Chunk-SHA256" to hash(chunk)), "application/octet-stream")))
            check(next.uploadId == current.uploadId && next.receivedBytes == from.toLong() + count) { "파일 수신 위치가 일치하지 않습니다." }
            current = next
        }
        val file = parse(send("POST", "/files/uploads/${current.uploadId}/complete"))
        check(file.get("visibility")?.asString() == "PRIVATE" && file.get("sha256")?.asString() == sha
            && file.get("size")?.asLong() == bytes.size.toLong()
            && file.get("retentionCode")?.asString() == settings.fileRetentionCode) { "파일 저장 결과가 일치하지 않습니다." }
        return UUID.fromString(file.get("fileId").asString())
    }

    fun views(fileId: UUID): JsonNode = parse(send("POST", "/files/$fileId/view-ticket"))

    fun content(fileId: UUID, variant: String, range: String?): PlatformContent {
        val headers = if (range == null) emptyMap() else mapOf("Range" to range)
        val response = send("GET", "/files/$fileId/content/$variant", headers = headers, maximum = 32 * 1024 * 1024)
        return PlatformContent(response.status, response.bytes, response.headers)
    }

    fun hls(fileId: UUID, asset: String, range: String?): PlatformContent {
        val headers = if (range == null) emptyMap() else mapOf("Range" to range)
        val response = send("GET", "/files/$fileId/hls/$asset", headers = headers, maximum = 32 * 1024 * 1024)
        return PlatformContent(response.status, response.bytes, response.headers)
    }
    fun delete(fileId: UUID) { send("DELETE", "/files/$fileId") }

    fun deleteUnused(fileId: UUID) {
        // Read first after every uncertain outcome; do not blindly replay a destructive request.
        val current = send("GET", "/files/$fileId", allowMissing = true)
        if (current.status == 404) return
        check(UUID.fromString(parse(current).get("fileId").asString()) == fileId) { "파일 정보가 일치하지 않습니다." }
        val deleted = send("DELETE", "/files/$fileId")
        check(deleted.status == 204) { "파일 삭제를 확인하지 못했습니다." }
    }

    private fun uploadState(node: JsonNode): PlatformUpload {
        return PlatformUpload(UUID.fromString(node.get("uploadId").asString()), node.get("state").asString(),
            node.get("receivedBytes").asLong(), node.get("maxChunkBytes").asInt(),
            node.get("fileId").takeUnless { it == null || it.isNull }?.asString()?.let(UUID::fromString))
    }

    private data class Result(val status: Int, val bytes: ByteArray, val headers: java.net.http.HttpHeaders)

    private fun send(method: String, path: String, body: ByteArray? = null,
        headers: Map<String, String> = emptyMap(), contentType: String = "application/json",
        maximum: Int = 1024 * 1024, allowMissing: Boolean = false): Result {
        val builder = HttpRequest.newBuilder(URI(settings.platformBaseUrl.trimEnd('/') + "/api/v1" + path))
            .timeout(Duration.ofSeconds(60)).header("X-Platform-Key", settings.platformKey)
        for ((name, value) in headers) builder.header(name, value)
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofByteArray(body)
        if (body != null) builder.header("Content-Type", contentType)
        try {
            val response = client.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofInputStream())
            val bytes = response.body().use { it.readNBytes(maximum + 1) }
            if (bytes.size > maximum) throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "파일 서비스 응답이 너무 큽니다.")
            if (response.statusCode() !in 200..299 && response.statusCode() != 416) {
                var code = ""
                var reference = response.headers().firstValue("X-Request-ID").orElse("")
                try {
                    val problem = json.readTree(bytes)
                    val receivedCode = problem.get("code")?.asString().orEmpty()
                    if (Regex("^[A-Z0-9_]{1,80}$").matches(receivedCode)) code = receivedCode
                    if (reference.isBlank()) reference = problem.get("requestId")?.asString().orEmpty()
                } catch (_: tools.jackson.core.JacksonException) { }
                if (allowMissing && method == "GET" && response.statusCode() == 404 && code == "FILE_NOT_FOUND")
                    return Result(404, bytes, response.headers())
                if (!Regex("^[a-zA-Z0-9_-]{1,80}$").matches(reference)) reference = ""
                val detail = listOf(code, reference).filter { it.isNotEmpty() }.joinToString(" / ")
                throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "파일 서비스 요청을 처리하지 못했습니다." + if (detail.isEmpty()) "" else " ($detail)")
            }
            return Result(response.statusCode(), bytes, response.headers())
        } catch (_: IOException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "파일 서비스에 연결하지 못했습니다. 같은 파일로 다시 시도해주세요.")
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "파일 요청이 중단되었습니다. 같은 파일로 다시 시도해주세요.")
        }
    }

    private fun parse(result: Result): JsonNode {
        try { return json.readTree(result.bytes) }
        catch (_: tools.jackson.core.JacksonException) { throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "파일 서비스 응답을 확인하지 못했습니다.") }
    }

    companion object {
        fun hash(bytes: ByteArray): String = java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
    }
}

data class PlatformContent(val status: Int, val bytes: ByteArray, val headers: java.net.http.HttpHeaders)

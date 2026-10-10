package kr.shnea.status.pdf

import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

@Service
class PdfRenderer(private val json: JsonMapper, @Value("\${status.pdf-renderer-url:http://pdf:3001}") private val url: String) {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()

    fun render(job: PdfJob): ByteArray {
        val request = HttpRequest.newBuilder(URI(url + "/render")).timeout(Duration.ofSeconds(75))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(mapOf("jobId" to job.id, "token" to job.token)))).build()
        try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
            val bytes = response.body().use { it.readNBytes(32 * 1024 * 1024 + 1) }
            if (response.statusCode() == 429) throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "PDF 생성 중입니다. 잠시 후 다시 시도해주세요.")
            if (response.statusCode() != 200 || bytes.size > 32 * 1024 * 1024 || bytes.size < 5 ||
                String(bytes.copyOfRange(0, 5), Charsets.US_ASCII) != "%PDF-")
                throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "PDF를 생성하지 못했습니다. 다시 시도해주세요.")
            return bytes
        } catch (error: IOException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "PDF 생성 서비스에 연결하지 못했습니다.")
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "PDF 생성이 중단되었습니다.")
        }
    }
}

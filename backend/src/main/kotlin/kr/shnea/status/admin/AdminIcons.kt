package kr.shnea.status.admin

import kr.shnea.status.account.Member
import kr.shnea.status.catalog.CatalogIcon
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Locale

data class IconRegistration(val title: String, val key: String, val hex: String)

@Service
class SimpleIconSource {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
        .followRedirects(HttpClient.Redirect.NEVER).build()

    fun exists(key: String): Boolean {
        require(Regex("[a-z0-9]{1,100}").matches(key)) { "Simple Icons 식별자를 확인해주세요." }
        val request = HttpRequest.newBuilder(URI("https://cdn.simpleicons.org/$key"))
            .timeout(Duration.ofSeconds(4)).method("HEAD", HttpRequest.BodyPublishers.noBody()).build()
        try {
            val response = client.send(request, HttpResponse.BodyHandlers.discarding())
            return response.statusCode() == 200 &&
                response.headers().firstValue("Content-Type").orElse("").startsWith("image/svg+xml")
        } catch (error: Exception) {
            if (error is InterruptedException) Thread.currentThread().interrupt()
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "아이콘 제공 여부를 확인하지 못했습니다. 다시 시도해주세요.")
        }
    }
}

@Service
class AdminIcons(private val jdbc: JdbcTemplate, private val source: SimpleIconSource, private val admin: AdminService) {
    @Transactional
    fun create(actor: Member, input: IconRegistration): CatalogIcon {
        val title = input.title.trim()
        val key = input.key.trim().lowercase(Locale.ROOT)
        val hex = input.hex.trim().removePrefix("#").uppercase(Locale.ROOT)
        require(title.isNotBlank() && title.length <= 100) { "아이콘 이름을 확인해주세요." }
        require(Regex("[a-z0-9]{1,100}").matches(key)) { "Simple Icons 식별자를 확인해주세요." }
        require(Regex("[0-9A-F]{6}").matches(hex)) { "원본 색상은 6자리 HEX로 입력해주세요." }
        require(source.exists(key)) { "CDN에서 제공하지 않는 아이콘입니다. Simple Icons 식별자를 확인해주세요." }
        jdbc.update("INSERT INTO icon_catalog(provider,key,title,hex,monochrome_allowed) VALUES ('simple-icons',?,?,?,false)",
            key, title, hex)
        admin.audit(actor.id, null, "icon-create", key)
        return CatalogIcon(key = key, title = title, hex = hex)
    }
}

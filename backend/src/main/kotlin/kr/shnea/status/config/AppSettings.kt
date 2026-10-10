package kr.shnea.status.config

import jakarta.annotation.PostConstruct
import org.springframework.boot.context.properties.ConfigurationProperties
import java.net.URI
import java.util.UUID

@ConfigurationProperties("status")
class AppSettings(
    val environment: String,
    val publicUrl: String,
    val platformBaseUrl: String,
    val projectId: UUID,
    val environmentId: UUID,
    val platformKey: String,
    val issuer: String,
    val redirectUri: String,
    val logoutRedirectUri: String,
    val adminIssuer: String = "",
    val adminSubject: String = "",
    val secureCookie: Boolean,
    val fileRetentionCode: String = "영구"
) {
    @PostConstruct
    fun validate() {
        require(environment in setOf("local", "dev", "prod")) { "APP_ENV is invalid" }
        require(fileRetentionCode.isNotBlank() && fileRetentionCode != "default") { "Explicit file retention policy is required" }
        require(platformKey.isNotBlank()) { "PLATFORM_API_KEY is required" }
        require(adminIssuer.isBlank() == adminSubject.isBlank()) { "Both ADMIN_OIDC values must be set together" }
        val publicOrigin = URI(publicUrl)
        require(publicOrigin.scheme in setOf("http", "https") && publicOrigin.host != null && publicOrigin.userInfo == null)
        for (value in listOf(redirectUri, logoutRedirectUri)) {
            val uri = URI(value)
            require(uri.scheme == publicOrigin.scheme && uri.authority == publicOrigin.authority) { "OIDC redirect origin must match APP_PUBLIC_URL" }
        }
        require(URI(redirectUri).path == "/callback") { "OIDC callback must use /callback" }
        require(URI(issuer).scheme == "https") { "OIDC issuer must use HTTPS" }
        require(URI(platformBaseUrl).scheme == "https") { "Platform origin must use HTTPS" }
        if (environment == "prod") {
            require(publicOrigin.scheme == "https" && secureCookie) { "Production requires HTTPS and secure session cookies" }
        }
    }

    fun isAdmin(verifiedIssuer: String, verifiedSubject: String): Boolean {
        return adminIssuer.isNotBlank() && verifiedIssuer == adminIssuer && verifiedSubject == adminSubject
    }
}

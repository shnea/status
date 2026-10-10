package kr.shnea.status.account

import kr.shnea.status.config.AppSettings
import kr.shnea.status.portfolio.PortfolioDocument
import kr.shnea.status.portfolio.Profile
import kr.shnea.status.portfolio.TemplateCatalog
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

data class Member(
    val id: UUID,
    val issuer: String,
    val subject: String,
    val displayName: String,
    val suspended: Boolean,
    val aiAllowed: Boolean,
    val joinedAt: Instant
)
data class SessionView(val member: Member?, val admin: Boolean, val csrfToken: String)

@Service
class Accounts(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val settings: AppSettings, private val templates: TemplateCatalog) {
    @Transactional
    fun provision(user: OidcUser): Member {
        val issuer = user.idToken.issuer.toString()
        val subject = requireNotNull(user.subject) { "OIDC subject is required" }
        val name = user.givenName.orEmpty()
        jdbc.update(
            "INSERT INTO members(id, issuer, subject, display_name) VALUES (?, ?, ?, ?) ON CONFLICT (issuer, subject) DO NOTHING",
            UUID.randomUUID(), issuer, subject, name
        )
        val member = find(issuer, subject) ?: throw IllegalStateException("Member provisioning failed")
        val document = PortfolioDocument(profile = Profile(name = name), template = templates.defaultId())
        jdbc.update(
            "INSERT INTO portfolios(id, member_id, slug, draft) VALUES (?, ?, ?, ?::jsonb) ON CONFLICT (member_id) DO NOTHING",
            UUID.randomUUID(), member.id, "u" + member.id.toString().replace("-", "").take(24), json.writeValueAsString(document)
        )
        jdbc.update("INSERT INTO slug_aliases(slug, portfolio_id) SELECT slug, id FROM portfolios WHERE member_id = ? ON CONFLICT DO NOTHING", member.id)
        return member
    }

    fun find(issuer: String, subject: String): Member? {
        return jdbc.query("SELECT * FROM members WHERE issuer = ? AND subject = ?", { row, _ ->
            Member(
                row.getObject("id", UUID::class.java), row.getString("issuer"), row.getString("subject"),
                row.getString("display_name"), row.getBoolean("suspended"), row.getBoolean("ai_allowed"),
                row.getTimestamp("joined_at").toInstant()
            )
        }, issuer, subject).firstOrNull()
    }

    fun current(authentication: Authentication?): Member? {
        val user = authentication?.principal as? OidcUser ?: return null
        val subject = user.subject ?: return null
        return find(user.idToken.issuer.toString(), subject) ?: provision(user)
    }

    fun requireActive(authentication: Authentication?): Member {
        val member = current(authentication) ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.")
        if (member.suspended) throw ResponseStatusException(HttpStatus.FORBIDDEN, "이용이 정지된 계정입니다.")
        return member
    }

    fun requireAdmin(authentication: Authentication?): Member {
        val member = requireActive(authentication)
        if (!settings.isAdmin(member.issuer, member.subject)) throw ResponseStatusException(HttpStatus.FORBIDDEN, "관리자 권한이 필요합니다.")
        return member
    }

    fun isAdmin(member: Member?): Boolean {
        return member != null && !member.suspended && settings.isAdmin(member.issuer, member.subject)
    }
}

package kr.shnea.status.admin

import kr.shnea.status.account.Member
import kr.shnea.status.config.AppSettings
import kr.shnea.status.portfolio.TemplateCatalog
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

data class AdminUser(val id: UUID, val name: String, val slug: String, val suspended: Boolean, val reason: String?, val aiAllowed: Boolean, val public: Boolean, val joinedAt: Instant, val views: Long, val visitors: Long)
data class Suspension(val suspended: Boolean, val reason: String = "")
data class AiPermission(val enabled: Boolean)
data class Overview(val users: Long, val suspended: Long, val publicPortfolios: Long, val views: Long, val visitors: Long)
data class DesignChange(val enabled: Boolean, val isDefault: Boolean)
data class AuditEntry(val action: String, val detail: String, val targetId: UUID?, val at: Instant, val targetName: String?)

@Service
class AdminService(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val settings: AppSettings, private val templates: TemplateCatalog) {
    fun overview(): Overview {
        return Overview(count("SELECT count(*) FROM members"), count("SELECT count(*) FROM members WHERE suspended"),
            count("SELECT count(*) FROM portfolios p JOIN members m ON m.id = p.member_id WHERE is_public AND NOT suspended"),
            count("SELECT count(*) FROM visits"), count("SELECT count(DISTINCT (portfolio_id,visitor_hash)) FROM visits"))
    }

    fun users(query: String, page: Int): List<AdminUser> {
        require(query.length <= 100 && page in 0..10000)
        return jdbc.query(
            """SELECT m.*, p.slug, p.is_public,
               (SELECT count(*) FROM visits v WHERE v.portfolio_id = p.id) AS views,
               (SELECT count(DISTINCT visitor_hash) FROM visits v WHERE v.portfolio_id = p.id) AS visitors
               FROM members m JOIN portfolios p ON p.member_id = m.id
               WHERE position(lower(?) in lower(m.display_name || ' ' || p.slug || ' ' || m.subject)) > 0
               ORDER BY m.joined_at DESC, m.id LIMIT 30 OFFSET ?""",
            { row, _ -> AdminUser(row.getObject("id", UUID::class.java), row.getString("display_name"), row.getString("slug"),
                row.getBoolean("suspended"), row.getString("suspension_reason"), row.getBoolean("ai_allowed"), row.getBoolean("is_public"),
                row.getTimestamp("joined_at").toInstant(), row.getLong("views"), row.getLong("visitors")) }, query.trim(), page * 30
        )
    }

    @Transactional
    fun suspend(actor: Member, target: UUID, input: Suspension) {
        require(input.reason.length <= 500 && (!input.suspended || input.reason.isNotBlank())) { "정지 사유를 입력해주세요." }
        val identity = jdbc.query("SELECT issuer,subject FROM members WHERE id = ? FOR UPDATE",
            { row, _ -> Pair(row.getString("issuer"), row.getString("subject")) }, target).firstOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        require(!settings.isAdmin(identity.first, identity.second)) { "슈퍼관리자는 정지할 수 없습니다." }
        jdbc.update("UPDATE members SET suspended = ?, suspension_reason = ? WHERE id = ?", input.suspended, if (input.suspended) input.reason else null, target)
        if (input.suspended) jdbc.update("UPDATE portfolios SET is_public = false WHERE member_id = ?", target)
        audit(actor.id, target, if (input.suspended) "suspend" else "restore", input.reason)
    }

    @Transactional
    fun aiPermission(actor: Member, target: UUID, enabled: Boolean) {
        if (jdbc.update("UPDATE members SET ai_allowed = ? WHERE id = ?", enabled, target) != 1) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        audit(actor.id, target, "ai-permission", enabled.toString())
    }


    @Transactional
    fun design(actor: Member, id: String, change: DesignChange) {
        jdbc.queryForList("SELECT id FROM template_settings ORDER BY id FOR UPDATE")
        val current = templates.all().firstOrNull { it.id == id } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        require(!change.enabled || current.implemented) { "아직 구현되지 않은 템플릿입니다." }
        require(!change.isDefault || change.enabled) { "기본 템플릿은 선택 가능해야 합니다." }
        require(!current.isDefault || change.isDefault || templates.all().any { it.id != id && it.isDefault }) { "기본 템플릿을 먼저 지정해주세요." }
        if (change.isDefault) jdbc.update("UPDATE template_settings SET is_default = false")
        jdbc.update("UPDATE template_settings SET enabled = ?, is_default = ? WHERE id = ?", change.enabled, change.isDefault, id)
        audit(actor.id, null, "design", id)
    }

    fun auditEntries(): List<AuditEntry> {
        return jdbc.query("""SELECT a.*,COALESCE(NULLIF(m.display_name,''),'@' || p.slug,s.name,t.title,i.title) AS target_name
            FROM admin_audit a LEFT JOIN members m ON m.id=a.target_id LEFT JOIN portfolios p ON p.member_id=m.id
            LEFT JOIN skill_dictionary s ON a.action IN ('skill-create','skill-update') AND s.id::text=a.detail
            LEFT JOIN template_settings t ON a.action='design' AND t.id=a.detail
            LEFT JOIN icon_catalog i ON a.action='icon-create' AND i.provider='simple-icons' AND i.key=a.detail
            ORDER BY a.created_at DESC LIMIT 100""",
            { row, _ -> AuditEntry(row.getString("action"), row.getString("detail"), row.getObject("target_id", UUID::class.java),
                row.getTimestamp("created_at").toInstant(), row.getString("target_name")) })
    }

    private fun count(sql: String): Long = jdbc.queryForObject(sql, Long::class.java) ?: 0

    fun audit(actor: UUID, target: UUID?, action: String, detail: String) {
        jdbc.update("INSERT INTO admin_audit(id,actor_id,target_id,action,detail) VALUES (?,?,?,?,?)", UUID.randomUUID(), actor, target, action, detail)
    }
}

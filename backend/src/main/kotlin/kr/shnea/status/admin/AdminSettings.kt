package kr.shnea.status.admin

import kr.shnea.status.account.Member
import kr.shnea.status.config.SiteConfiguration
import kr.shnea.status.config.SiteSettings
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper

data class AiLimits(val sessionDaily: Int = 10, val portfolioDaily: Int = 100, val globalDaily: Int = 1000, val sessionMinute: Int = 3)
data class AiUsage(val total: Long, val completed: Long, val failed: Long, val today: Long, val averageLatencyMs: Long?)
data class SystemSettings(val aiLimits: AiLimits, val site: SiteConfiguration? = null)

@Service
class AdminSettings(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val admin: AdminService, private val site: SiteSettings) {
    fun settings(): SystemSettings {
        val value = jdbc.queryForObject("SELECT value::text FROM system_settings WHERE key='ai_limits'", String::class.java)
        return SystemSettings(json.readValue(value, AiLimits::class.java), site.configuration())
    }

    @Transactional
    fun update(actor: Member, input: SystemSettings) {
        val limits = input.aiLimits
        require(listOf(limits.sessionDaily, limits.portfolioDaily, limits.globalDaily, limits.sessionMinute).all { it in 1..1_000_000 }) { "사용 한도는 1~1,000,000 사이로 입력해주세요." }
        jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_limits'", json.writeValueAsString(limits))
        admin.audit(actor.id, null, "ai-limits", json.writeValueAsString(limits))
        if (input.site != null) {
            site.update(actor, input.site)
            admin.audit(actor.id, null, "site-settings", json.writeValueAsString(input.site))
        }
    }

    fun usage(): AiUsage {
        return jdbc.query(
            """SELECT count(*) AS total,
               count(*) FILTER (WHERE status IN ('COMPLETED','EMPTY')) AS completed,
               count(*) FILTER (WHERE status='FAILED') AS failed,
               count(*) FILTER (WHERE requested_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS today,
               round(avg(latency_ms)) AS latency FROM ai_requests""",
            { row, _ ->
                AiUsage(row.getLong("total"), row.getLong("completed"), row.getLong("failed"), row.getLong("today"),
                    row.getObject("latency")?.let { (it as Number).toLong() })
            }
        ).single()
    }
}

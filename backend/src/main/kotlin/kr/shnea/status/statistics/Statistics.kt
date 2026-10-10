package kr.shnea.status.statistics

import kr.shnea.status.account.Accounts
import kr.shnea.status.portfolio.PortfolioRepository
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import jakarta.servlet.http.HttpServletRequest
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

data class VisitEvent(val eventId: UUID)
data class DailyStatistics(val date: LocalDate, val views: Long, val sessions: Long, val registrations: Long, val publications: Long)
data class StatisticsReport(val days: Int, val memberId: UUID?, val daily: List<DailyStatistics>)

@Service
class Statistics(private val jdbc: JdbcTemplate, private val portfolios: PortfolioRepository, private val accounts: Accounts) {
    fun record(slug: String, input: VisitEvent, authentication: Authentication?, request: HttpServletRequest) {
        val portfolio = portfolios.bySlug(slug) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (accounts.current(authentication)?.id == portfolio.memberId) return
        val agent = request.getHeader("User-Agent").orEmpty().lowercase()
        if (listOf("bot", "spider", "crawler", "slack", "discord", "facebookexternalhit", "telegram", "whatsapp").any { it in agent }) return
        if ("prefetch" in request.getHeader("Sec-Purpose").orEmpty().lowercase()) return
        val session = request.getSession(false) ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "방문 세션이 필요합니다.")
        val day = LocalDate.now(ZoneId.of("Asia/Seoul"))
        val visitor = MessageDigest.getInstance("SHA-256").digest((session.id + ":" + day).toByteArray())
            .joinToString("") { "%02x".format(it) }
        jdbc.update(
            """INSERT INTO visits(event_id,portfolio_id,visitor_hash)
               SELECT ?,p.id,? FROM portfolios p JOIN members m ON m.id=p.member_id
               WHERE p.id=? AND p.is_public AND p.published IS NOT NULL AND NOT m.suspended
               ON CONFLICT (event_id) DO NOTHING""",
            input.eventId, visitor, portfolio.id
        )
    }

    fun report(days: Int, memberId: UUID?): StatisticsReport {
        require(days in setOf(7, 30, 90)) { "통계 기간은 7일·30일·90일 중 선택해주세요." }
        if (memberId != null && jdbc.queryForObject("SELECT count(*) FROM members WHERE id=?", Long::class.java, memberId) != 1L)
            throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val daily = jdbc.query(
            """WITH dates AS (
                SELECT generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - (? - 1),
                    (now() AT TIME ZONE 'Asia/Seoul')::date, interval '1 day') AS day
               ), visits_by_day AS (
                SELECT (v.visited_at AT TIME ZONE 'Asia/Seoul')::date AS day, count(*) AS views,
                    count(DISTINCT (v.portfolio_id,v.visitor_hash)) AS sessions
                FROM visits v JOIN portfolios p ON p.id=v.portfolio_id
                WHERE (?::uuid IS NULL OR p.member_id=?)
                    AND v.visited_at >= ((now() AT TIME ZONE 'Asia/Seoul')::date - (? - 1))::timestamp AT TIME ZONE 'Asia/Seoul'
                GROUP BY 1
               ), joins_by_day AS (
                SELECT (joined_at AT TIME ZONE 'Asia/Seoul')::date AS day, count(*) AS registrations
                FROM members WHERE (?::uuid IS NULL OR id=?) GROUP BY 1
               ), publications_by_day AS (
                SELECT (e.published_at AT TIME ZONE 'Asia/Seoul')::date AS day, count(*) AS publications
                FROM portfolio_publications e JOIN portfolios p ON p.id=e.portfolio_id
                WHERE (?::uuid IS NULL OR p.member_id=?) GROUP BY 1
               )
               SELECT d.day::date AS day, coalesce(v.views,0) AS views, coalesce(v.sessions,0) AS sessions,
                   coalesce(j.registrations,0) AS registrations, coalesce(p.publications,0) AS publications
               FROM dates d LEFT JOIN visits_by_day v ON d.day::date=v.day
                   LEFT JOIN joins_by_day j ON d.day::date=j.day LEFT JOIN publications_by_day p ON d.day::date=p.day
               ORDER BY d.day""",
            { row, _ -> DailyStatistics(row.getDate("day").toLocalDate(), row.getLong("views"), row.getLong("sessions"),
                row.getLong("registrations"), row.getLong("publications")) },
            days, memberId, memberId, days, memberId, memberId, memberId, memberId
        )
        return StatisticsReport(days, memberId, daily)
    }
}

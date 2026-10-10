package kr.shnea.status.portfolio

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

data class SitemapEntry(val path: String, val updatedAt: Instant)
data class SitemapPage(val pages: Long, val entries: List<SitemapEntry>)

@RestController
class PublicSitemap(private val jdbc: JdbcTemplate) {
    @GetMapping("/api/public/sitemap")
    fun page(@RequestParam(defaultValue = "0") page: Int): ResponseEntity<SitemapPage> {
        require(page in 0..1_000_000) { "페이지를 확인해주세요." }
        val total = jdbc.queryForObject(
            """SELECT coalesce(sum(1+jsonb_array_length(p.published->'projects')),0)
               FROM portfolios p JOIN members m ON m.id=p.member_id
               WHERE p.is_public AND p.published IS NOT NULL AND NOT m.suspended""", Long::class.java) ?: 0L
        val entries = jdbc.query(
            """WITH public_portfolios AS (
                 SELECT p.slug,p.published,p.published_at FROM portfolios p JOIN members m ON m.id=p.member_id
                 WHERE p.is_public AND p.published IS NOT NULL AND NOT m.suspended
               ), paths AS (
                 SELECT '/@'||slug AS path,published_at FROM public_portfolios
                 UNION ALL
                 SELECT '/@'||p.slug||'/projects/'||(project->>'id') AS path,p.published_at
                 FROM public_portfolios p CROSS JOIN LATERAL jsonb_array_elements(p.published->'projects') project
               ) SELECT * FROM paths ORDER BY path LIMIT 1000 OFFSET ?""",
            { row, _ -> SitemapEntry(row.getString("path"), row.getTimestamp("published_at").toInstant()) }, page.toLong() * 1000
        )
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(SitemapPage((total + 999) / 1000, entries))
    }
}

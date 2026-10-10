package kr.shnea.status.portfolio

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper
import java.sql.ResultSet
import java.util.UUID

@Repository
class PortfolioRepository(private val jdbc: JdbcTemplate, private val json: JsonMapper) {
    fun byOwner(memberId: UUID, lock: Boolean = false): PortfolioRecord? {
        val sql = "SELECT * FROM portfolios WHERE member_id = ?" + if (lock) " FOR UPDATE" else ""
        return jdbc.query(sql, { row, _ -> record(row) }, memberId).firstOrNull()
    }

    fun bySlug(slug: String): PortfolioRecord? {
        return jdbc.query(
            """SELECT p.* FROM portfolios p JOIN members m ON m.id = p.member_id
               JOIN slug_aliases a ON a.portfolio_id = p.id
               WHERE a.slug = ? AND p.is_public AND p.published IS NOT NULL AND NOT m.suspended""",
            { row, _ -> record(row) }, slug
        ).firstOrNull()
    }

    fun saveDraft(id: UUID, revision: Long, document: PortfolioDocument): Boolean {
        return jdbc.update(
            "UPDATE portfolios SET draft = ?::jsonb, draft_revision = draft_revision + 1, updated_at = now() WHERE id = ? AND draft_revision = ?",
            json.writeValueAsString(document), id, revision
        ) == 1
    }

    fun publish(record: PortfolioRecord, publicDocument: PortfolioDocument) {
        jdbc.update(
            "UPDATE portfolios SET published = ?::jsonb, published_revision = ?, is_public = true, published_at = now() WHERE id = ?",
            json.writeValueAsString(publicDocument), record.revision, record.id
        )
        jdbc.update("INSERT INTO portfolio_publications(portfolio_id,revision) VALUES (?,?) ON CONFLICT DO NOTHING", record.id, record.revision)
    }

    fun aiAllowed(memberId: UUID): Boolean {
        return jdbc.queryForObject("SELECT ai_allowed AND NOT suspended AND EXISTS(SELECT 1 FROM system_settings WHERE key='ai_enabled' AND value='true'::jsonb) FROM members WHERE id = ?", Boolean::class.java, memberId) == true
    }

    private fun record(row: ResultSet): PortfolioRecord {
        val publishedText = row.getString("published")
        return PortfolioRecord(
            row.getObject("id", UUID::class.java), row.getObject("member_id", UUID::class.java), row.getString("slug"),
            json.readValue(row.getString("draft"), PortfolioDocument::class.java), row.getLong("draft_revision"),
            if (publishedText == null) null else json.readValue(publishedText, PortfolioDocument::class.java),
            row.getObject("published_revision", Long::class.javaObjectType),
            row.getBoolean("is_public"), row.getBoolean("ai_consent"), row.getTimestamp("updated_at").toInstant()
        )
    }
}

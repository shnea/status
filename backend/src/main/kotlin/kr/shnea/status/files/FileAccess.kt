package kr.shnea.status.files

import kr.shnea.status.portfolio.PortfolioDocument
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

@Service
class FileAccess(private val jdbc: JdbcTemplate, private val json: JsonMapper) {
    fun requireOwner(memberId: UUID, fileId: UUID) {
        val count = jdbc.queryForObject("""SELECT count(*) FROM uploaded_files f JOIN members m ON m.id = f.member_id
            WHERE f.id = ? AND f.member_id = ? AND f.cleanup_started_at IS NULL AND NOT m.suspended""", Int::class.java, fileId, memberId)
        if (count != 1) missing()
    }

    fun requirePublic(portfolioId: UUID, fileId: UUID) {
        val documents = jdbc.query("""SELECT p.published FROM portfolios p
            JOIN members m ON m.id = p.member_id JOIN uploaded_files f ON f.member_id = m.id
            WHERE p.id = ? AND f.id = ? AND f.cleanup_started_at IS NULL AND p.is_public AND NOT m.suspended AND p.published IS NOT NULL""",
            { row, _ -> json.readValue(row.getString("published"), PortfolioDocument::class.java) }, portfolioId, fileId)
        if (documents.isEmpty() || fileId !in references(documents.first().publicProjection())) missing()
    }

    fun fileName(fileId: UUID): String = jdbc.queryForObject("SELECT original_name FROM uploaded_files WHERE id=?", String::class.java, fileId).orEmpty()

    fun retain(document: PortfolioDocument) {
        for (id in references(document)) retain(id)
    }

    fun retain(fileId: UUID) {
        jdbc.update("UPDATE uploaded_files SET unreferenced_since=NULL,cleanup_checked_at=clock_timestamp() WHERE id=? AND cleanup_started_at IS NULL", fileId)
    }

    fun references(document: PortfolioDocument): Set<UUID> {
        val ids = mutableSetOf<UUID>()
        fun body(node: JsonNode?) {
            if (node == null || node.isNull) return
            if (node.get("type")?.asString() == "attachment") {
                val value = node.get("attrs")?.get("fileId")
                if (value?.isString == true) ids.add(UUID.fromString(value.asString()))
            }
            val children = node.get("content")
            if (children?.isArray == true) for (child in children) body(child)
            else if (children?.isObject == true) body(children)
        }
        document.profile.imageId?.let(ids::add)
        document.profile.bannerImageId?.let(ids::add)
        body(document.profile.about)
        for (project in document.projects) { project.imageId?.let(ids::add); body(project.content) }
        for (history in document.history) body(history.content)
        return ids
    }

    private fun missing(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.")
}

package kr.shnea.status.files

import kr.shnea.status.config.SiteSettings
import kr.shnea.status.portfolio.PortfolioDocument
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

data class UnusedFile(val id: UUID, val ownerId: UUID, val name: String, val size: Long, val uploadedAt: Instant,
    val ownerName: String, val unreferencedSince: Instant?, val deleteAfter: Instant?, val deleting: Boolean, val retryPending: Boolean)
data class FileReview(val items: List<UnusedFile>, val inspected: Int, val hasMore: Boolean)

@Service
class FileCleanup(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val access: FileAccess,
    private val site: SiteSettings, private val transactions: TransactionTemplate, private val platform: PlatformFiles) {
    private val logger = LoggerFactory.getLogger(javaClass)

    fun review(page: Int): FileReview {
        require(page in 0..10000) { "목록 범위를 확인해주세요." }
        val files = jdbc.query("""SELECT f.*,COALESCE(NULLIF(m.display_name,''),'@' || p.slug,'이름 미등록') AS owner_name
            FROM uploaded_files f JOIN members m ON m.id=f.member_id LEFT JOIN portfolios p ON p.member_id=m.id
            WHERE f.cleanup_completed_at IS NULL ORDER BY f.created_at DESC,f.id LIMIT 101 OFFSET ?""",
            { row, _ ->
                val since = row.getTimestamp("unreferenced_since")?.toInstant()
                UnusedFile(row.getObject("id", UUID::class.java), row.getObject("member_id", UUID::class.java),
                    row.getString("original_name"), row.getLong("size"), row.getTimestamp("created_at").toInstant(),
                    row.getString("owner_name"), since, since?.plusSeconds(7 * 24 * 60 * 60),
                    row.getTimestamp("cleanup_started_at") != null, row.getString("cleanup_error") != null)
            }, page * 100)
        val shared = site.configuration().shareImageId
        val references = mutableMapOf<UUID, Set<UUID>>()
        val inspected = files.take(100)
        val unused = inspected.filter { file ->
            file.id != shared && file.id !in references.getOrPut(file.ownerId) { references(file.ownerId) }
        }
        return FileReview(unused, inspected.size, files.size > 100)
    }

    fun tick() {
        val inspect = jdbc.query("""SELECT id FROM uploaded_files WHERE cleanup_started_at IS NULL
            ORDER BY cleanup_checked_at ASC NULLS FIRST,id LIMIT 50""", { row, _ -> row.getObject(1, UUID::class.java) })
        for (id in inspect) inspect(id)
        val pending = jdbc.query("""SELECT id FROM uploaded_files WHERE cleanup_started_at IS NOT NULL
            AND cleanup_completed_at IS NULL AND cleanup_retry_at <= clock_timestamp()
            ORDER BY cleanup_retry_at,id LIMIT 5""", { row, _ -> row.getObject(1, UUID::class.java) })
        for (id in pending) delete(id)
    }

    private fun inspect(id: UUID) {
        transactions.executeWithoutResult {
            val owner = owner(id) ?: return@executeWithoutResult
            if (!lockReferences(owner)) return@executeWithoutResult
            val rows = jdbc.query("""SELECT unreferenced_since,cleanup_started_at FROM uploaded_files
                WHERE id=? FOR UPDATE SKIP LOCKED""", { row, _ ->
                    Pair(row.getTimestamp("unreferenced_since")?.toInstant(), row.getTimestamp("cleanup_started_at"))
                }, id)
            val current = rows.firstOrNull() ?: return@executeWithoutResult
            if (current.second != null) return@executeWithoutResult
            val used = id == site.configuration().shareImageId || id in references(owner)
            if (used) {
                jdbc.update("UPDATE uploaded_files SET unreferenced_since=NULL,cleanup_checked_at=clock_timestamp() WHERE id=?", id)
            } else {
                // Never backdate a newly observed candidate, including pre-existing uploads.
                jdbc.update("""UPDATE uploaded_files SET unreferenced_since=COALESCE(unreferenced_since,clock_timestamp()),
                    cleanup_checked_at=clock_timestamp() WHERE id=?""", id)
                jdbc.update("""UPDATE uploaded_files SET cleanup_started_at=clock_timestamp(),cleanup_retry_at=clock_timestamp()
                    WHERE id=? AND unreferenced_since <= clock_timestamp()-interval '7 days'""", id)
            }
        }
    }

    private fun delete(id: UUID) {
        val claimed = transactions.execute {
            val owner = owner(id) ?: return@execute false
            if (!lockReferences(owner)) return@execute false
            val pending = jdbc.query("""SELECT cleanup_attempts FROM uploaded_files WHERE id=?
                AND cleanup_started_at IS NOT NULL AND cleanup_completed_at IS NULL
                AND cleanup_retry_at <= clock_timestamp() FOR UPDATE SKIP LOCKED""", { row, _ -> row.getInt(1) }, id)
            if (pending.isEmpty()) return@execute false
            // Recheck all stored documents and the shared image immediately before contacting the file service.
            if (id == site.configuration().shareImageId || id in references(owner)) {
                if (pending.first() == 0) {
                    jdbc.update("""UPDATE uploaded_files SET unreferenced_since=NULL,cleanup_started_at=NULL,
                        cleanup_retry_at=NULL,cleanup_error=NULL WHERE id=?""", id)
                } else {
                    jdbc.update("""UPDATE uploaded_files SET cleanup_retry_at=clock_timestamp()+interval '15 minutes',
                        cleanup_error='REFERENCES_CHANGED' WHERE id=?""", id)
                }
                return@execute false
            }
            jdbc.update("""UPDATE uploaded_files SET cleanup_attempts=cleanup_attempts+1,
                cleanup_retry_at=clock_timestamp()+interval '15 minutes' WHERE id=?""", id)
            true
        } == true
        if (!claimed) return
        // The committed tombstone blocks new references and upload retries after a crash or uncertain DELETE.
        try {
            platform.deleteUnused(id)
            jdbc.update("""UPDATE uploaded_files SET cleanup_completed_at=clock_timestamp(),cleanup_retry_at=NULL,
                cleanup_error=NULL WHERE id=? AND cleanup_started_at IS NOT NULL""", id)
        } catch (_: RuntimeException) {
            jdbc.update("UPDATE uploaded_files SET cleanup_error='PLATFORM_UNAVAILABLE' WHERE id=?", id)
            logger.warn("Unused attachment deletion deferred; it will be checked again before retry.")
        }
    }

    private fun owner(id: UUID): UUID? = jdbc.query("SELECT member_id FROM uploaded_files WHERE id=?",
        { row, _ -> row.getObject(1, UUID::class.java) }, id).firstOrNull()

    private fun lockReferences(owner: UUID): Boolean {
        // Member-first order matches saves and uploads; the site row serializes share-image changes.
        val members = jdbc.query("SELECT id FROM members WHERE id=? FOR UPDATE SKIP LOCKED",
            { row, _ -> row.getObject(1, UUID::class.java) }, owner)
        if (members.isEmpty()) return false
        val settings = jdbc.query("SELECT key FROM system_settings WHERE key='site' FOR UPDATE SKIP LOCKED",
            { row, _ -> row.getString(1) })
        if (settings.isEmpty()) return false
        jdbc.queryForList("SELECT id FROM portfolios WHERE member_id=? FOR UPDATE", owner)
        return true
    }

    private fun references(owner: UUID): Set<UUID> {
        val documents = jdbc.query("SELECT draft::text,published::text FROM portfolios WHERE member_id=?",
            { row, _ -> listOfNotNull(row.getString("draft"), row.getString("published"))
                .map { json.readValue(it, PortfolioDocument::class.java) } }, owner).flatten()
        // Include hidden drafts, suspended accounts and the retained published snapshot.
        return documents.flatMap { access.references(it) }.toSet()
    }
}

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = ["status.file-cleanup-enabled"], havingValue = "true", matchIfMissing = true)
class FileCleanupWorker(private val cleanup: FileCleanup) {
    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    fun work() { cleanup.tick() }
}

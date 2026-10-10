package kr.shnea.status.ai

import kr.shnea.status.account.Member
import kr.shnea.status.admin.AdminService
import kr.shnea.status.portfolio.PortfolioRecord
import kr.shnea.status.portfolio.PortfolioRepository
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

data class ReindexBatch(val id: UUID, val targets: Int, val completed: Long, val failed: Long, val pending: Long, val superseded: Long, val createdAt: Instant)

data class IndexJob(val id: UUID, val portfolioId: UUID, val revision: Long, val status: String,
    val collection: String?, val remoteId: UUID?, val batch: Int, val errorCode: String?, val createdAt: Instant, val totalDocuments: Int, val cleanupState: String?, val memberId: UUID, val slug: String)

@Service
class AiIndex(private val jdbc: JdbcTemplate, private val repository: PortfolioRepository,
    private val platform: PlatformAi, manager: PlatformTransactionManager, private val admin: AdminService) {
    private val transactions = TransactionTemplate(manager)

    fun enabled(): Boolean = jdbc.queryForObject("SELECT value::text FROM system_settings WHERE key='ai_enabled'", String::class.java) == "true"

    fun scope(slug: String): PortfolioRecord {
        val record = repository.bySlug(slug) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "공개 포트폴리오를 찾을 수 없습니다.")
        if (!eligible(record)) throw ResponseStatusException(HttpStatus.FORBIDDEN, "AI 사용이 허용되지 않았습니다.")
        return record
    }

    fun eligible(record: PortfolioRecord): Boolean =
        enabled() && record.isPublic && record.published != null && record.aiConsent && repository.aiAllowed(record.memberId)

    fun jobs(): List<IndexJob> = jdbc.query("SELECT j.*,p.member_id,p.slug FROM ai_index_jobs j JOIN portfolios p ON p.id=j.portfolio_id ORDER BY j.created_at DESC,j.id LIMIT 100", { row, _ ->
        IndexJob(row.getObject("id", UUID::class.java), row.getObject("portfolio_id", UUID::class.java),
            row.getLong("published_revision"), row.getString("status"), row.getString("collection"),
            row.getObject("remote_job_id", UUID::class.java), row.getInt("next_batch"), row.getString("error_code"), row.getTimestamp("created_at").toInstant(), row.getInt("total_documents"), row.getString("cleanup_state"), row.getObject("member_id", UUID::class.java), row.getString("slug"))
    })

    fun ready(record: PortfolioRecord): IndexJob? = jobsFor(record.id).firstOrNull { it.status == "ready" && it.revision == record.publishedRevision && it.cleanupState == null }

    private fun jobsFor(id: UUID): List<IndexJob> = jdbc.query(
        "SELECT j.*,p.member_id,p.slug FROM ai_index_jobs j JOIN portfolios p ON p.id=j.portfolio_id WHERE portfolio_id=? ORDER BY finished_at DESC NULLS LAST,created_at DESC", { row, _ ->
            IndexJob(row.getObject("id", UUID::class.java), id, row.getLong("published_revision"),
                row.getString("status"), row.getString("collection"), row.getObject("remote_job_id", UUID::class.java),
                row.getInt("next_batch"), row.getString("error_code"), row.getTimestamp("created_at").toInstant(), row.getInt("total_documents"), row.getString("cleanup_state"), row.getObject("member_id", UUID::class.java), row.getString("slug"))
        }, id)

    fun enqueue(actor: Member, memberId: UUID?): Int {
        val count = transactions.execute {
            jdbc.execute("SELECT pg_advisory_xact_lock(3016502)")
            val records = jdbc.query("SELECT member_id FROM portfolios WHERE (?::uuid IS NULL OR member_id=?::uuid)",
                { row, _ -> row.getObject(1, UUID::class.java) }, memberId, memberId).mapNotNull { repository.byOwner(it, true) }
            val batchId = UUID.randomUUID()
            jdbc.update("INSERT INTO ai_reindex_batches(id) VALUES (?)", batchId)
            var added = 0
            for (record in records) {
                if (!eligible(record) || jobsFor(record.id).any { it.status == "unconfirmed" }) continue
                added += jdbc.update(
                    "INSERT INTO ai_index_jobs(id,portfolio_id,published_revision,status,batch_id) VALUES (?,?,?,'queued',?) ON CONFLICT DO NOTHING",
                    UUID.randomUUID(), record.id, record.publishedRevision, batchId)
            }
            jdbc.update("UPDATE ai_reindex_batches SET targets=? WHERE id=?", added, batchId)
            admin.audit(actor.id, memberId, "ai-reindex", added.toString())
            added
        }
        return count
    }

    fun toggle(actor: Member, enabled: Boolean) {
        transactions.executeWithoutResult {
            jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_enabled'", enabled.toString())
            admin.audit(actor.id, null, "ai-enabled", enabled.toString())
        }
    }

    // No HTTP calls inside the claiming transaction. A lease and SKIP LOCKED allow safe restart recovery.
    fun tick() {
        cleanup();
        if (!enabled()) return
        transactions.executeWithoutResult {
            jdbc.update("""INSERT INTO ai_index_jobs(id,portfolio_id,published_revision,status)
                SELECT gen_random_uuid(),p.id,p.published_revision,'queued' FROM portfolios p JOIN members m ON m.id=p.member_id
                WHERE p.is_public AND p.published IS NOT NULL AND p.ai_consent AND m.ai_allowed AND NOT m.suspended
                AND NOT EXISTS(SELECT 1 FROM ai_index_jobs j WHERE j.portfolio_id=p.id AND
                    (j.status IN ('queued','running','waiting') OR j.published_revision=p.published_revision AND j.status IN ('failed','unconfirmed') OR j.published_revision=p.published_revision AND j.status='ready' AND j.cleanup_state IS NULL))
                ON CONFLICT DO NOTHING""")
        }
        val job = transactions.execute {
            val id = jdbc.query("""SELECT id FROM ai_index_jobs WHERE status IN ('queued','running','waiting')
                AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1""",
                { row, _ -> row.getObject(1, UUID::class.java) }).firstOrNull() ?: return@execute null
            jdbc.update("UPDATE ai_index_jobs SET lease_until=now()+interval '90 seconds',started_at=coalesce(started_at,now()),collection=coalesce(collection,?) WHERE id=?",
                "status_" + id.toString().replace("-", ""), id)
            val portfolioId = jdbc.queryForObject("SELECT portfolio_id FROM ai_index_jobs WHERE id=?", UUID::class.java, id)
            jobsFor(requireNotNull(portfolioId)).first { it.id == id }
        } ?: return
        try {
            val memberId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, job.portfolioId)
            val record = memberId?.let { repository.byOwner(it) }
            if (record == null || !eligible(record) || record.publishedRevision != job.revision) {
                finish(job, "superseded", null); return
            }
            val documents = AiDocuments.from(requireNotNull(record.published), record.slug)
            jdbc.update("UPDATE ai_index_jobs SET total_documents=? WHERE id=?", documents.size, job.id)
            val batches = documents.chunked(30)
            if (job.batch >= batches.size) { finish(job, "ready", null); return }
            val remote = if (job.remoteId != null) platform.indexStatus(job.remoteId)
                else platform.index(job.id, job.batch, requireNotNull(job.collection), batches[job.batch])
            val id = UUID.fromString(remote.get("id")?.asString() ?: throw AiFailure("INVALID_RESPONSE", true))
            when (remote.get("status")?.asString()) {
                "succeeded" -> {
                    jdbc.update("UPDATE ai_index_jobs SET status='running',next_batch=next_batch+1,remote_job_id=NULL,lease_until=NULL WHERE id=?", job.id)
                }
                "pending", "running" -> jdbc.update("UPDATE ai_index_jobs SET status='waiting',remote_job_id=?,lease_until=now()+interval '3 seconds' WHERE id=?", id, job.id)
                "failed", "cancelled" -> finish(job, "failed", "INDEX_FAILED")
                else -> throw AiFailure("INVALID_RESPONSE", true)
            }
        } catch (error: AiFailure) { finish(job, if (error.uncertain) "unconfirmed" else "failed", error.code) }
        catch (_: IllegalArgumentException) { finish(job, "failed", "INVALID_DOCUMENT") }
    }

    fun batches(): List<ReindexBatch> = jdbc.query("""SELECT b.*,count(j.id) FILTER(WHERE j.status='ready') AS completed,
        count(j.id) FILTER(WHERE j.status IN ('failed','unconfirmed')) AS failed,
        count(j.id) FILTER(WHERE j.status IN ('queued','running','waiting')) AS pending,
        count(j.id) FILTER(WHERE j.status='superseded') AS superseded
        FROM ai_reindex_batches b LEFT JOIN ai_index_jobs j ON j.batch_id=b.id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 20""",
        { row, _ -> ReindexBatch(row.getObject("id", UUID::class.java), row.getInt("targets"), row.getLong("completed"),
            row.getLong("failed"), row.getLong("pending"), row.getLong("superseded"), row.getTimestamp("created_at").toInstant()) })

    fun summary(): Map<String, Long> = jdbc.query("SELECT status,count(*) AS count FROM ai_index_jobs GROUP BY status",
        { row, _ -> row.getString("status") to row.getLong("count") }).toMap()

    fun recover(actor: Member, id: UUID) {
        val memberId = jdbc.queryForObject("SELECT p.member_id FROM portfolios p JOIN ai_index_jobs j ON j.portfolio_id=p.id WHERE j.id=?", UUID::class.java, id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val record = repository.byOwner(memberId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val job = jobsFor(record.id).firstOrNull { it.id == id } ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (job.status != "unconfirmed" && job.cleanupState != "unconfirmed") throw ResponseStatusException(HttpStatus.CONFLICT, "접수 확인이 필요한 작업만 복구할 수 있습니다.")
        val items = platform.indexJobs()
        if (!items.isArray) throw AiFailure("INVALID_RESPONSE")
        val requestId = if (job.cleanupState == "unconfirmed") "status-clear-$id" else "status-index-$id-${job.batch}"
        val remote = items.firstOrNull { it.get("request_id")?.asString() == requestId }
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "최근 플랫폼 작업에서 접수를 확인하지 못했습니다. 관리자가 플랫폼 작업 상태를 확인해주세요.")
        val remoteId = UUID.fromString(remote.get("id").asString())
        if (job.cleanupState == "unconfirmed") jdbc.update("UPDATE ai_index_jobs SET cleanup_state='pending',cleanup_job_id=?,error_code=NULL WHERE id=?", remoteId, id)
        else jdbc.update("UPDATE ai_index_jobs SET status='waiting',remote_job_id=?,lease_until=NULL,error_code=NULL,finished_at=NULL WHERE id=?", remoteId, id)
        admin.audit(actor.id, memberId, "ai-index-recover", id.toString())
    }

    private fun cleanup() {
        val ids = jdbc.query("""SELECT j.id,j.portfolio_id FROM ai_index_jobs j JOIN portfolios p ON p.id=j.portfolio_id JOIN members m ON m.id=p.member_id
            WHERE j.collection IS NOT NULL AND j.status IN ('ready','superseded','failed')
            AND (j.cleanup_state IS NULL OR j.cleanup_state='pending') AND (
                NOT p.is_public OR NOT p.ai_consent OR NOT m.ai_allowed OR m.suspended OR p.published_revision<>j.published_revision
                OR NOT EXISTS(SELECT 1 FROM system_settings WHERE key='ai_enabled' AND value='true'::jsonb)
                OR EXISTS(SELECT 1 FROM ai_index_jobs newer WHERE newer.portfolio_id=j.portfolio_id AND newer.status='ready'
                    AND newer.cleanup_state IS NULL AND newer.published_revision=j.published_revision AND newer.finished_at>j.finished_at))
            ORDER BY j.created_at LIMIT 1""", { row, _ -> row.getObject("id", UUID::class.java) to row.getObject("portfolio_id", UUID::class.java) }).firstOrNull() ?: return
        val job = jobsFor(ids.second).firstOrNull { it.id == ids.first } ?: return
        try {
            if (job.remoteId != null && platform.indexStatus(job.remoteId).get("status")?.asString() in setOf("pending", "running")) return
            val cleanupId = jdbc.queryForObject("SELECT cleanup_job_id FROM ai_index_jobs WHERE id=?", UUID::class.java, job.id)
            val remote = if (cleanupId == null) platform.clear(requireNotNull(job.collection), job.id) else platform.indexStatus(cleanupId)
            val id = UUID.fromString(remote.get("id")?.asString() ?: throw AiFailure("INVALID_RESPONSE", true))
            val state = when (remote.get("status")?.asString()) {
                "succeeded" -> "retired"
                "pending", "running" -> "pending"
                else -> "failed"
            }
            jdbc.update("UPDATE ai_index_jobs SET cleanup_state=?,cleanup_job_id=? WHERE id=?", state, id, job.id)
        } catch (error: AiFailure) {
            jdbc.update("UPDATE ai_index_jobs SET cleanup_state=?,error_code=? WHERE id=?",
                if (error.uncertain) "unconfirmed" else "failed", error.code, job.id)
        }
    }

    private fun finish(job: IndexJob, status: String, error: String?) {
        // Ready publication is conditional on the current revision and current permission.
        if (status == "ready") {
            val updated = jdbc.update("""UPDATE ai_index_jobs j SET status='ready',finished_at=now(),lease_until=NULL
                WHERE j.id=? AND EXISTS(SELECT 1 FROM portfolios p JOIN members m ON m.id=p.member_id
                    WHERE p.id=j.portfolio_id AND p.published_revision=j.published_revision AND p.is_public AND p.ai_consent
                    AND m.ai_allowed AND NOT m.suspended) AND EXISTS(SELECT 1 FROM system_settings WHERE key='ai_enabled' AND value='true'::jsonb)""", job.id)
            if (updated == 1) return
        }
        jdbc.update("UPDATE ai_index_jobs SET status=?,error_code=?,finished_at=now(),lease_until=NULL WHERE id=?",
            if (status == "ready") "superseded" else status, error, job.id)
    }
}

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = ["status.ai-worker-enabled"], havingValue = "true", matchIfMissing = true)
class AiWorker(private val index: AiIndex) {
    @Scheduled(fixedDelay = 3000, initialDelay = 5000)
    fun work() { index.tick() }
}

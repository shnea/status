package kr.shnea.status.pdf

import kr.shnea.status.files.FileAccess
import kr.shnea.status.portfolio.PortfolioDocument
import kr.shnea.status.portfolio.PortfolioRepository
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class ExportPdf(val version: String, val revision: Long, val includeProjectDetails: Boolean = false)
data class PrintDocument(val document: PortfolioDocument, val slug: String, val publicProjectIds: Set<UUID>, val version: String, val revision: Long)
data class PdfJob(val id: UUID, val token: String, val ownerId: UUID, val view: PrintDocument, val files: Set<UUID>, val expiresAt: Instant)

@Service
class PdfJobs(private val portfolios: PortfolioRepository, private val files: FileAccess, private val jdbc: JdbcTemplate) {
    private val jobs = ConcurrentHashMap<UUID, PdfJob>()
    private val random = SecureRandom()

    @Synchronized
    fun create(ownerId: UUID, input: ExportPdf): PdfJob {
        require(input.version in setOf("draft", "published")) { "출력할 버전을 확인해주세요." }
        for ((id, job) in jobs) if (job.expiresAt.isBefore(Instant.now())) jobs.remove(id)
        if (jobs.size >= 8) throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "PDF 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.")
        val current = portfolios.byOwner(ownerId) ?: missing()
        val revision = if (input.version == "draft") current.revision else current.publishedRevision ?: missing()
        if (revision != input.revision) throw ResponseStatusException(HttpStatus.CONFLICT, "저장 버전이 바뀌었습니다. 최신 버전으로 다시 시도해주세요.")
        val source = if (input.version == "draft") current.draft else current.published ?: missing()
        val document = source.publicProjection()
        val printable = document.copy(projects = document.projects.map { if (input.includeProjectDetails) it else it.copy(content = null) })
        val publicIds = if (current.isPublic) current.published?.publicProjection()?.projects?.map { it.id }?.toSet().orEmpty() else emptySet()
        val tokenBytes = ByteArray(32)
        random.nextBytes(tokenBytes)
        val job = PdfJob(UUID.randomUUID(), Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes),
            ownerId, PrintDocument(printable, current.slug, publicIds, input.version, revision), files.references(printable), Instant.now().plusSeconds(180))
        jobs[job.id] = job
        return job
    }

    fun find(id: UUID, authorization: String?): PdfJob {
        val job = jobs[id] ?: missing()
        if (job.expiresAt.isBefore(Instant.now())) { jobs.remove(id); missing() }
        if (!MessageDigest.isEqual(("Bearer " + job.token).toByteArray(), authorization.orEmpty().toByteArray())) missing()
        if (jdbc.queryForObject("SELECT count(*) FROM members WHERE id=? AND NOT suspended", Int::class.java, job.ownerId) != 1) missing()
        return job
    }

    fun file(id: UUID, authorization: String?, fileId: UUID): PdfJob {
        val job = find(id, authorization)
        if (fileId !in job.files) missing()
        files.requireOwner(job.ownerId, fileId)
        return job
    }

    fun remove(id: UUID) { jobs.remove(id) }
    private fun missing(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND, "출력 자료를 찾을 수 없습니다.")
}

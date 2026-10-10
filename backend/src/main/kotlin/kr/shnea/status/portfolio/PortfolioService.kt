package kr.shnea.status.portfolio

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class PortfolioService(
    private val repository: PortfolioRepository,
    private val validation: PortfolioValidation,
    private val jdbc: JdbcTemplate,
    private val files: kr.shnea.status.files.FileAccess
) {
    fun draft(memberId: UUID): DraftView = view(own(memberId))

    @Transactional
    fun save(memberId: UUID, input: SaveDraft): DraftView {
        lockActiveMember(memberId)
        val current = own(memberId, true)
        if (current.revision != input.revision) conflict()
        val normalized = validation.normalize(memberId, input.document, current.draft)
        if (!repository.saveDraft(current.id, input.revision, normalized)) conflict()
        files.retain(normalized)
        jdbc.update("UPDATE members SET display_name = ? WHERE id = ?", normalized.profile.name, memberId)
        return view(own(memberId))
    }

    @Transactional
    fun publish(memberId: UUID, revision: Long): DraftView {
        lockActiveMember(memberId)
        val current = own(memberId, true)
        if (current.revision != revision) conflict()
        val published = current.draft.publicProjection()
        validation.validateForPublish(published)
        repository.publish(current, published)
        files.retain(current.draft)
        if (current.aiConsent && repository.aiAllowed(memberId)) {
            jdbc.update("INSERT INTO ai_index_jobs(id,portfolio_id,published_revision,status) VALUES (?,?,?,'queued') ON CONFLICT DO NOTHING",
                UUID.randomUUID(), current.id, current.revision)
        }
        return view(own(memberId))
    }

    @Transactional
    fun unpublish(memberId: UUID): DraftView {
        lockActiveMember(memberId)
        val current = own(memberId, true)
        jdbc.update("UPDATE portfolios SET is_public = false WHERE id = ?", current.id)
        return view(own(memberId))
    }

    @Transactional
    fun consent(memberId: UUID, enabled: Boolean): DraftView {
        lockActiveMember(memberId)
        val current = own(memberId, true)
        if (enabled && !repository.aiAllowed(memberId))
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "관리자가 AI 사용을 허용하지 않았습니다.")
        jdbc.update("UPDATE portfolios SET ai_consent = ? WHERE id = ?", enabled, current.id)
        return view(own(memberId))
    }

    @Transactional
    fun changeSlug(memberId: UUID, requested: String): DraftView {
        lockActiveMember(memberId)
        val current = own(memberId, true)
        if (requested.trim() != current.slug)
            throw kr.shnea.status.config.CodedApiFailure(HttpStatus.CONFLICT, "공개 주소는 변경할 수 없습니다.", "PUBLIC_ADDRESS_FIXED")
        return view(current)
    }

    fun publicPortfolio(slug: String): PublicPortfolio {
        val record = repository.bySlug(slug) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "포트폴리오를 찾을 수 없습니다.")
        val published = record.published ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return PublicPortfolio(record.id, record.slug, published, record.publishedRevision ?: 0,
            record.aiConsent && repository.aiAllowed(record.memberId), record.slug)
    }

    fun publicProject(slug: String, id: UUID): Project {
        return publicPortfolio(slug).document.projects.firstOrNull { it.id == id }
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "프로젝트를 찾을 수 없습니다.")
    }

    private fun own(memberId: UUID, lock: Boolean = false): PortfolioRecord {
        return repository.byOwner(memberId, lock) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "포트폴리오가 없습니다.")
    }

    private fun lockActiveMember(memberId: UUID) {
        val suspended = jdbc.queryForObject("SELECT suspended FROM members WHERE id = ? FOR UPDATE", Boolean::class.java, memberId)
        if (suspended != false) throw ResponseStatusException(HttpStatus.FORBIDDEN, "이용이 정지된 계정입니다.")
    }

    private fun view(record: PortfolioRecord): DraftView {
        return DraftView(record.id, record.slug, record.draft, record.revision, record.publishedRevision, record.isPublic, record.aiConsent, record.updatedAt)
    }

    private fun conflict(): Nothing {
        throw ResponseStatusException(HttpStatus.CONFLICT, "다른 탭에서 수정되었습니다. 현재 입력을 보존하고 새 버전을 확인해주세요.")
    }
}

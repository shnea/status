package kr.shnea.status.portfolio

import kr.shnea.status.catalog.SkillCatalog
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID

@Service
class PortfolioValidation(private val jdbc: JdbcTemplate, private val catalog: SkillCatalog, private val json: JsonMapper, private val editorDocuments: EditorDocuments) {
    fun normalize(memberId: UUID, document: PortfolioDocument, previous: PortfolioDocument): PortfolioDocument {
        require(json.writeValueAsBytes(document).size <= 1024 * 1024) { "포트폴리오 내용은 1MiB 이하로 저장해주세요." }
        require(document.profile.name.length <= 100 && document.profile.title.length <= 200 && document.profile.introduction.length <= 300) { "이름·메인 타이틀 또는 한 줄 소개가 너무 깁니다." }
        require(document.sections.map { it.id }.toSet() == setOf("skills", "projects", "history", "certifications") && document.sections.size == 4) { "섹션 설정을 확인해주세요." }
        require(document.skills.count { it.featured } <= 10) { "대표 스킬은 최대 10개입니다." }
        requireUnique(document.skills.map { it.id })
        requireUnique(document.projects.map { it.id })
        requireUnique(document.history.map { it.id })
        requireUnique(document.certifications.map { it.id })
        val selectedIds = document.skills.map { it.id }.toSet()
        val previousIds = previous.skills.map { it.id }.toSet()
        val skills = document.skills.map { catalog.resolve(memberId, it, previousIds) }
        editorDocuments.validate(memberId, document.profile.about)
        validateContacts(document.profile.contacts)
        validateFile(memberId, document.profile.imageId)
        validateFile(memberId, document.profile.bannerImageId)
        for (project in document.projects) {
            require(project.title.length <= 200 && project.role.length <= 200 && project.summary.length <= 1000) { "프로젝트 제목·역할·요약이 너무 깁니다." }
            require(project.skillIds.all { it in selectedIds } && project.skillIds.distinct().size == project.skillIds.size) { "프로젝트 스킬은 선택된 스킬에서 고르세요." }
            validateContacts(project.links)
            validateFile(memberId, project.imageId)
            editorDocuments.validate(memberId, project.content)
        }
        for (history in document.history) {
            require(history.title.length <= 200 && history.organization.length <= 200 && history.role.length <= 200 && history.summary.length <= 1000) { "히스토리 내용이 너무 깁니다." }
            val start = month(history.startMonth)
            val end = month(history.endMonth)
            require(!history.ongoing || end == null) { "진행 중이면 종료일을 비워주세요." }
            require(start == null || end == null || end >= start) { "종료일은 시작일 이후여야 합니다." }
            editorDocuments.validate(memberId, history.content)
        }
        for (cert in document.certifications) {
            require(cert.name.length <= 200 && cert.issuer.length <= 200 && cert.credentialId.length <= 200) { "자격 인증 내용이 너무 깁니다." }
            val issue = date(cert.issuedOn)
            val expiry = date(cert.expiresOn)
            require(issue == null || expiry == null || expiry >= issue) { "만료일은 발급일 이후여야 합니다." }
            if (cert.url.isNotBlank()) validateWebUrl(cert.url)
        }
        if (document.template != previous.template) {
            require(jdbc.queryForObject("SELECT count(*) FROM template_settings WHERE id = ? AND enabled AND implemented", Int::class.java, document.template) == 1) { "선택할 수 없는 템플릿입니다." }
        }
        return document.copy(skills = skills)
    }

    fun validateForPublish(document: PortfolioDocument) {
        require(document.profile.name.isNotBlank()) { "공개하려면 표시 이름을 입력해주세요." }
        require(document.projects.filter { it.visible }.all { it.title.isNotBlank() }) { "공개 프로젝트의 제목을 입력해주세요." }
        require(document.history.filter { it.visible }.all { it.title.isNotBlank() }) { "공개 히스토리의 제목을 입력해주세요." }
        require(document.certifications.filter { it.visible }.all { it.name.isNotBlank() }) { "공개 자격 인증의 이름을 입력해주세요." }
    }

    private fun requireUnique(ids: List<UUID>) {
        require(ids.distinct().size == ids.size) { "동일 항목을 중복 저장할 수 없습니다." }
    }

    private fun validateContacts(contacts: List<Contact>) {
        requireUnique(contacts.map { it.id })
        for (link in contacts) {
            require(link.label.length <= 100 && link.value.length <= 2000 && link.icon.length <= 40) { "연락처 입력이 너무 깁니다." }
            require(link.type in setOf("web", "email", "phone")) { "연락처 유형을 확인해주세요." }
            if (link.value.isBlank()) continue
            when (link.type) {
                "web" -> validateWebUrl(link.value)
                "email" -> require(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(link.value)) { "이메일을 확인해주세요." }
                "phone" -> require(Regex("^[+0-9() .-]{3,30}$").matches(link.value)) { "전화번호를 확인해주세요." }
            }
        }
    }

    private fun validateWebUrl(value: String) {
        val uri = try { URI(value) } catch (_: java.net.URISyntaxException) {
            throw IllegalArgumentException("http 또는 https 링크를 입력해주세요.")
        }
        require(uri.scheme in setOf("http", "https") && uri.host != null && uri.userInfo == null) { "http 또는 https 링크를 입력해주세요." }
    }

    private fun month(value: String): YearMonth? {
        if (value.isBlank()) return null
        require(Regex("^\\d{4}-\\d{2}$").matches(value)) { "연월은 YYYY-MM 형식입니다." }
        return try { YearMonth.parse(value) } catch (_: java.time.format.DateTimeParseException) {
            throw IllegalArgumentException("연월을 확인해주세요.")
        }
    }

    private fun date(value: String): LocalDate? {
        if (value.isBlank()) return null
        return try { LocalDate.parse(value) } catch (_: java.time.format.DateTimeParseException) {
            throw IllegalArgumentException("날짜를 확인해주세요.")
        }
    }

    private fun validateFile(memberId: UUID, fileId: UUID?) {
        if (fileId == null) return
        require(jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id = ? AND member_id = ? AND cleanup_started_at IS NULL", Int::class.java, fileId, memberId) == 1) { "본인의 첨부 파일만 사용할 수 있습니다." }
    }

}

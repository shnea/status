package kr.shnea.status.config

import kr.shnea.status.account.Member
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

data class SiteConfiguration(
    val serviceName: String = "상태창",
    val announcement: String = "",
    val announcementEnabled: Boolean = false,
    val shareImageId: UUID? = null,
    val imageMaxMiB: Int = 10,
    val attachmentMaxMiB: Int = 10
)
data class PublicSiteSettings(val serviceName: String, val announcement: String, val shareImageUrl: String,
    val imageMaxMiB: Int, val attachmentMaxMiB: Int)

@Service
class SiteSettings(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val environment: AppSettings, private val files: kr.shnea.status.files.FileAccess) {
    fun configuration(): SiteConfiguration {
        return json.readValue(jdbc.queryForObject("SELECT value::text FROM system_settings WHERE key='site'", String::class.java),
            SiteConfiguration::class.java)
    }

    fun publicSettings(): PublicSiteSettings {
        val current = configuration()
        val image = current.shareImageId?.takeIf { shareImageAvailable(it) }
        return PublicSiteSettings(current.serviceName, if (current.announcementEnabled) current.announcement else "",
            if (image == null) "/share-default.png" else "/api/public/site/files/$image/content/preview",
            current.imageMaxMiB, current.attachmentMaxMiB)
    }

    @org.springframework.transaction.annotation.Transactional
    fun update(actor: Member, input: SiteConfiguration) {
        val active = jdbc.queryForObject("SELECT NOT suspended FROM members WHERE id=? FOR UPDATE", Boolean::class.java, actor.id)
        require(active == true) { "이용이 정지된 계정입니다." }
        jdbc.queryForObject("SELECT key FROM system_settings WHERE key='site' FOR UPDATE", String::class.java)
        require(input.serviceName.trim().isNotBlank() && input.serviceName.length <= 30) { "서비스 이름은 1~30자로 입력해주세요." }
        require(input.announcement.length <= 500) { "공지는 500자 이하로 입력해주세요." }
        require(input.imageMaxMiB in 1..10 && input.attachmentMaxMiB in 1..10) { "파일 한도는 현재 전송 한도인 1~10MiB 사이로 입력해주세요." }
        if (input.shareImageId != null) {
            require(jdbc.queryForObject("""SELECT count(*) FROM uploaded_files
                WHERE id=? AND member_id=? AND cleanup_started_at IS NULL AND media_type IN ('image/jpeg','image/png','image/webp')""",
                Int::class.java, input.shareImageId, actor.id) == 1) { "관리자가 등록한 공유 이미지를 선택해주세요." }
        }
        val value = input.copy(serviceName = input.serviceName.trim(), announcement = input.announcement.trim())
        jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='site'", json.writeValueAsString(value))
        value.shareImageId?.let { files.retain(it) }
    }

    fun requireShareImage(id: UUID) {
        if (configuration().shareImageId != id || !shareImageAvailable(id))
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다.")
    }

    fun uploadLimit(kind: String): Int {
        val current = configuration()
        return if (kind == "image") current.imageMaxMiB else current.attachmentMaxMiB
    }

    private fun shareImageAvailable(id: UUID): Boolean {
        return jdbc.queryForObject("""SELECT count(*) FROM uploaded_files f JOIN members m ON m.id=f.member_id
            WHERE f.id=? AND f.cleanup_started_at IS NULL AND m.issuer=? AND m.subject=? AND NOT m.suspended
            AND f.media_type IN ('image/jpeg','image/png','image/webp')""",
            Int::class.java, id, environment.adminIssuer, environment.adminSubject) == 1
    }
}

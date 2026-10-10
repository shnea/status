package kr.shnea.status.files

import kr.shnea.status.config.SiteSettings
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class AttachmentRef(val fileId: UUID, val scope: String, val kind: String, val name: String, val size: Long)

@Service
class FileUploads(private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate, private val platform: PlatformFiles, private val settings: SiteSettings) {
    fun upload(memberId: UUID, requestId: UUID, name: String, kind: String, declaredType: String?, bytes: ByteArray): AttachmentRef {
        val limit = settings.uploadLimit(kind)
        require(bytes.isNotEmpty() && bytes.size <= limit * 1024 * 1024) { "파일은 ${limit}MiB 이하로 등록해주세요." }
        require(kind in setOf("image", "file", "audio", "video")) { "첨부 유형을 확인해주세요." }
        val originalName = name.substringAfterLast('/').substringAfterLast('\\')
        require(originalName.isNotBlank() && originalName.length <= 255 && originalName.none { it.code < 32 || it.code == 127 }) { "파일명을 확인해주세요." }
        val mediaType = FileTypes.mediaType(originalName, kind, bytes)
        val sha = PlatformFiles.hash(bytes)

        // Persist the owner binding before contacting the platform, including uncertain network outcomes.
        transactions.executeWithoutResult {
            requireActive(memberId)
            jdbc.update("""INSERT INTO file_upload_requests(request_id,member_id,original_name,sha256,media_type,kind,size)
                VALUES (?,?,?,?,?,?,?) ON CONFLICT (request_id) DO NOTHING""",
                requestId, memberId, originalName, sha, mediaType, kind, bytes.size)
            requireSameRequest(requestId, memberId, originalName, sha, mediaType, kind, bytes.size.toLong())
        }

        val fileId = checkNotNull(transactions.execute {
            requireActive(memberId)
            jdbc.queryForObject("SELECT request_id FROM file_upload_requests WHERE request_id = ? FOR UPDATE", UUID::class.java, requestId)
            val savedId = jdbc.query("SELECT file_id FROM file_upload_requests WHERE request_id = ?", { row, _ ->
                row.getObject("file_id", UUID::class.java) }, requestId).firstOrNull()
            if (savedId != null && jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id=? AND cleanup_started_at IS NULL",
                    Int::class.java, savedId) != 1) {
                throw ResponseStatusException(HttpStatus.GONE, "정리된 파일입니다. 파일을 다시 선택해서 등록해주세요.")
            }
            val id = savedId ?: platform.upload(requestId, originalName, bytes, sha)
            requireActive(memberId)
            jdbc.update("""INSERT INTO uploaded_files(id,member_id,original_name,media_type,size) VALUES (?,?,?,?,?)
                ON CONFLICT (id) DO NOTHING""", id, memberId, originalName, mediaType, bytes.size)
            require(jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id = ? AND member_id = ? AND cleanup_started_at IS NULL", Int::class.java, id, memberId) == 1)
            jdbc.update("UPDATE file_upload_requests SET file_id = ? WHERE request_id = ?", id, requestId)
            id
        })
        return AttachmentRef(fileId, memberId.toString(), kind, originalName, bytes.size.toLong())
    }

    private fun requireSameRequest(requestId: UUID, memberId: UUID, name: String, sha: String, mediaType: String, kind: String, size: Long) {
        val matches = jdbc.queryForObject("""SELECT count(*) FROM file_upload_requests
            WHERE request_id = ? AND member_id = ? AND original_name = ? AND sha256 = ? AND media_type = ? AND kind = ? AND size = ?""",
            Int::class.java, requestId, memberId, name, sha, mediaType, kind, size)
        if (matches != 1) throw ResponseStatusException(HttpStatus.CONFLICT, "이미 사용한 파일 요청입니다. 같은 파일로 재시도하거나 새 파일을 선택해주세요.")
    }

    private fun requireActive(memberId: UUID) {
        if (jdbc.queryForObject("SELECT NOT suspended FROM members WHERE id=? FOR UPDATE", Boolean::class.java, memberId) != true)
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "이용이 정지된 계정입니다.")
    }

}

package kr.shnea.status.files

import kr.shnea.status.account.Accounts
import kr.shnea.status.config.SiteSettings
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import tools.jackson.databind.JsonNode
import java.util.UUID

data class AttachmentViews(val fileId: UUID, val kind: String, val state: String, val originalUrl: String,
    val previewUrl: String?, val thumbnailUrl: String?, val viewerUrl: String, val downloadUrl: String, val expiresAt: String? = null, val name: String = "", val mediaType: String = "",
    val streamUrl: String? = null, val video: VideoViews? = null, val subtitleUrls: Map<String, String> = emptyMap())
data class VideoViews(val state: String, val progress: Int, val subtitles: VideoSubtitles? = null)
data class VideoSubtitles(val mode: String, val language: String, val timing: String, val cueCount: Int)

@RestController
@RequestMapping("/api")
class FileController(private val accounts: Accounts, private val uploads: FileUploads,
    private val access: FileAccess, private val platform: PlatformFiles, private val site: SiteSettings, private val streams: FileStreams) {
    @PostMapping("/files", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(authentication: Authentication, @RequestPart file: MultipartFile,
        @RequestParam requestId: UUID, @RequestParam(defaultValue = "image") kind: String): ResponseEntity<AttachmentRef> {
        val owner = accounts.requireActive(authentication)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            uploads.upload(owner.id, requestId, file.originalFilename.orEmpty(), kind, file.contentType, file.bytes))
    }

    @GetMapping("/public/site/files/{id}/content/preview")
    fun shareImage(@PathVariable id: UUID): ResponseEntity<ByteArray> {
        site.requireShareImage(id)
        val response = content(id, "preview", null)
        site.requireShareImage(id)
        return response
    }
    @GetMapping("/files/{id}/views")
    fun ownViews(authentication: Authentication, @PathVariable id: UUID): ResponseEntity<AttachmentViews> {
        val memberId = accounts.requireActive(authentication).id
        access.requireOwner(memberId, id)
        val views = views(id, "/api/files/$id", platform.views(id))
        access.requireOwner(memberId, id)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(views)
    }

    @GetMapping("/public/files/{portfolioId}/{id}/views")
    fun publicViews(@PathVariable portfolioId: UUID, @PathVariable id: UUID): ResponseEntity<AttachmentViews> {
        access.requirePublic(portfolioId, id)
        val views = views(id, "/api/public/files/$portfolioId/$id", platform.views(id))
        access.requirePublic(portfolioId, id)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(views)
    }

    @GetMapping("/files/{id}/content/{variant}")
    fun ownContent(authentication: Authentication, @PathVariable id: UUID, @PathVariable variant: String,
        @RequestHeader(name = "Range", required = false) range: String?): ResponseEntity<ByteArray> {
        val memberId = accounts.requireActive(authentication).id
        access.requireOwner(memberId, id)
        val response = content(id, variant, range)
        access.requireOwner(memberId, id)
        return response
    }

    @GetMapping("/public/files/{portfolioId}/{id}/content/{variant}")
    fun publicContent(@PathVariable portfolioId: UUID, @PathVariable id: UUID, @PathVariable variant: String,
        @RequestHeader(name = "Range", required = false) range: String?): ResponseEntity<ByteArray> {
        access.requirePublic(portfolioId, id)
        val response = content(id, variant, range)
        access.requirePublic(portfolioId, id)
        return response
    }

    private fun views(id: UUID, base: String, source: JsonNode): AttachmentViews {
        require(source.get("fileId")?.asString() == id.toString()) { "파일 조회 결과가 일치하지 않습니다." }
        fun available(name: String): Boolean = source.get(name)?.isString == true
        val video = source.get("video")?.takeUnless { it.isNull }
        val subtitles = video?.get("subtitles")?.takeUnless { it.isNull }
        val subtitleViews = subtitles?.let {
            VideoSubtitles(it.get("mode").asString(), it.get("language").asString(), it.get("timing").asString(),
                it.get("cueCount").asInt())
        }
        val videoViews = video?.let {
            VideoViews(it.get("state").asString(), it.get("progress").asInt().coerceIn(0, 100), subtitleViews)
        }
        val subtitleUrls = mutableMapOf<String, String>()
        for (asset in listOf("subtitles.srt", "subtitles.vtt", "transcript.json", "transcript.txt")) {
            if (source.get("subtitleUrls")?.get(asset)?.isString == true) subtitleUrls[asset] = "$base/hls/$asset"
        }
        val portfolio = if (base.startsWith("/api/public/files/")) base.removePrefix("/api/public/files/").substringBefore('/') else null
        return AttachmentViews(id, source.get("kind").asString(), source.get("state").asString(),
            "$base/content/original", if (available("previewUrl")) "$base/content/preview" else null,
            if (available("thumbnailUrl")) "$base/content/thumbnail" else null,
            "/file-viewer/$id" + if (portfolio == null) "" else "?portfolioId=$portfolio", "$base/content/download",
            name = access.fileName(id), mediaType = source.get("mediaType")?.asString().orEmpty(),
            streamUrl = if (available("streamUrl")) "$base/hls/master.m3u8" else null, video = videoViews, subtitleUrls = subtitleUrls)
    }


    @GetMapping("/files/{id}/hls/{asset}")
    fun ownStream(authentication: Authentication, @PathVariable id: UUID, @PathVariable asset: String,
        @RequestHeader(name = "Range", required = false) range: String?): ResponseEntity<ByteArray> {
        val memberId = accounts.requireActive(authentication).id
        access.requireOwner(memberId, id)
        val response = stream(id, asset, range, "/api/files/$id/hls/")
        access.requireOwner(memberId, id)
        return response
    }

    @GetMapping("/public/files/{portfolioId}/{id}/hls/{asset}")
    fun publicStream(@PathVariable portfolioId: UUID, @PathVariable id: UUID, @PathVariable asset: String,
        @RequestHeader(name = "Range", required = false) range: String?): ResponseEntity<ByteArray> {
        access.requirePublic(portfolioId, id)
        val response = stream(id, asset, range, "/api/public/files/$portfolioId/$id/hls/")
        access.requirePublic(portfolioId, id)
        return response
    }

    private fun stream(id: UUID, asset: String, range: String?, base: String): ResponseEntity<ByteArray> {
        return response(streams.content(id, asset, range, base))
    }

    private fun content(id: UUID, variant: String, range: String?): ResponseEntity<ByteArray> {
        require(variant in setOf("original", "preview", "thumbnail", "download")) { "파일 변형을 확인해주세요." }
        require(range == null || Regex("^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$").matches(range)) { "단일 파일 범위를 요청해주세요." }
        return response(platform.content(id, variant, range))
    }

    private fun response(result: PlatformContent): ResponseEntity<ByteArray> {
        val headers = HttpHeaders()
        for (name in listOf("Content-Type", "Content-Disposition", "Content-Range", "Accept-Ranges")) {
            result.headers.firstValue(name).ifPresent { headers.set(name, it) }
        }
        headers.setCacheControl(CacheControl.noStore())
        headers.set("X-Content-Type-Options", "nosniff")
        headers.set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'")
        return ResponseEntity.status(result.status).headers(headers).body(result.bytes)
    }
}

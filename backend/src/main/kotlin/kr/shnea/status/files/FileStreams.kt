package kr.shnea.status.files

import kr.shnea.status.config.AppSettings
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.util.UUID

@Service
class FileStreams(private val platform: PlatformFiles, private val settings: AppSettings) {
    private val allowedAsset = Regex("^(?:master\\.m3u8|q[0-9]{1,4}(?:\\.m3u8|-[0-9]{5}\\.ts)|[0-9]{1,4}p(?:\\.m3u8|-[0-9]{5}\\.ts)|subtitles\\.(?:srt|vtt)|transcript\\.(?:json|txt))$")
    fun content(id: UUID, asset: String, range: String?, base: String): PlatformContent {
        require(allowedAsset.matches(asset)) { "영상 파일 경로를 확인해주세요." }
        require(range == null || !asset.endsWith(".m3u8") && Regex("^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$").matches(range)) {
            "단일 영상 범위를 요청해주세요."
        }
        val response = platform.hls(id, asset, range)
        if (!asset.endsWith(".m3u8")) return response
        if (response.status != 200 || response.bytes.size > 1024 * 1024) malformed()
        val text = String(response.bytes, Charsets.UTF_8)
        if (!text.startsWith("#EXTM3U") || text.contains('\u0000')) malformed()
        val output = text.lineSequence().map { line ->
            if (line.isBlank()) line
            else if (line.startsWith("#")) Regex("URI=\"([^\"]+)\"").replace(line) {
                "URI=\"" + base + assetName(id, it.groupValues[1]) + "\""
            }
            else base + assetName(id, line.trim())
        }.joinToString("\n")
        return response.copy(bytes = output.toByteArray(Charsets.UTF_8))
    }

    private fun assetName(id: UUID, value: String): String {
        val uri = try { URI(value) } catch (_: java.net.URISyntaxException) { malformed() }
        val path = uri.path ?: malformed()
        val asset: String
        if (uri.isAbsolute) {
            val origin = URI(settings.platformBaseUrl)
            if (uri.scheme != origin.scheme || uri.host != origin.host || uri.port != origin.port
                || uri.rawUserInfo != null || !path.startsWith("/api/v1/files/$id/hls/")) malformed()
            asset = path.removePrefix("/api/v1/files/$id/hls/")
        } else {
            if (uri.rawAuthority != null) malformed()
            if (path.startsWith("/") && !path.startsWith("/api/v1/files/$id/hls/")) malformed()
            asset = path.removePrefix("/api/v1/files/$id/hls/")
        }
        if (uri.fragment != null || !allowedAsset.matches(asset)) malformed()
        return asset
    }

    private fun malformed(): Nothing = throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "영상 재생 목록을 확인하지 못했습니다.")
}

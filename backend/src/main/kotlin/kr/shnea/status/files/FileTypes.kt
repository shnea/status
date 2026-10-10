package kr.shnea.status.files

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.Locale

object FileTypes {
    fun mediaType(name: String, kind: String, bytes: ByteArray): String {
        if (kind == "image") return imageType(bytes)
            ?: throw IllegalArgumentException("JPEG·PNG·WebP 이미지만 등록할 수 있습니다.")
        val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
        val type = when (extension) {
            "pdf" -> "application/pdf"
            "txt" -> "text/plain"
            "md" -> "text/markdown"
            "csv" -> "text/csv"
            "json" -> "application/json"
            "zip" -> "application/zip"
            "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "ogg" -> "audio/ogg"
            "m4a" -> "audio/mp4"
            "mp4" -> "video/mp4"
            "webm" -> "video/webm"
            else -> throw IllegalArgumentException("지원하지 않는 첨부 형식입니다.")
        }
        require(kind == "file" || kind == "audio" && type.startsWith("audio/") || kind == "video" && type.startsWith("video/")) {
            "첨부 유형과 파일 형식이 일치하지 않습니다."
        }
        val valid = when (extension) {
            "pdf" -> prefix(bytes, "%PDF-")
            "zip", "docx", "xlsx", "pptx" -> bytes.size >= 4 && bytes[0] == 80.toByte() && bytes[1] == 75.toByte()
                && bytes[2] == 3.toByte() && bytes[3] == 4.toByte()
            "mp3" -> prefix(bytes, "ID3") || bytes.size >= 2 && bytes[0].toInt() and 255 == 255 && bytes[1].toInt() and 224 == 224
            "wav" -> prefix(bytes, "RIFF") && textAt(bytes, 8, "WAVE")
            "ogg" -> prefix(bytes, "OggS")
            "m4a", "mp4" -> textAt(bytes, 4, "ftyp")
            "webm" -> bytes.size >= 4 && bytes.copyOfRange(0, 4).contentEquals(byteArrayOf(26, 69, -33, -93))
            else -> validText(bytes)
        }
        require(valid) { "파일 내용과 형식을 확인해주세요." }
        return type
    }

    private fun imageType(bytes: ByteArray): String? {
        if (bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10))) return "image/png"
        if (bytes.size >= 3 && bytes[0].toInt() == -1 && bytes[1].toInt() == -40 && bytes[2].toInt() == -1) return "image/jpeg"
        if (prefix(bytes, "RIFF") && textAt(bytes, 8, "WEBP")) return "image/webp"
        return null
    }

    private fun prefix(bytes: ByteArray, expected: String): Boolean = textAt(bytes, 0, expected)
    private fun textAt(bytes: ByteArray, offset: Int, expected: String): Boolean {
        return bytes.size >= offset + expected.length && String(bytes, offset, expected.length, Charsets.US_ASCII) == expected
    }
    private fun validText(bytes: ByteArray): Boolean {
        if (bytes.any { it == 0.toByte() }) return false
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes))
            true
        } catch (_: java.nio.charset.CharacterCodingException) { false }
    }
}

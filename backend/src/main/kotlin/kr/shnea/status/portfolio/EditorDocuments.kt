package kr.shnea.status.portfolio

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import java.net.URI
import java.util.UUID

@Service
class EditorDocuments(private val jdbc: JdbcTemplate) {
    private val blocks = setOf("paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "taskList", "horizontalRule", "table", "attachment", "mediaRow")
    private val inline = setOf("text", "hardBreak", "externalImage")
    private val attributes = mapOf(
        "heading" to setOf("level"), "codeBlock" to setOf("language"), "orderedList" to setOf("start", "type"),
        "tableCell" to setOf("colspan", "rowspan", "colwidth", "align"),
        "tableHeader" to setOf("colspan", "rowspan", "colwidth", "align"),
        "taskItem" to setOf("checked"), "externalImage" to setOf("source", "alt", "title"),
        "attachment" to setOf("id", "fileId", "scope", "kind", "name", "size", "widthPercent", "align"),
        "mediaRow" to setOf("id"), "link" to setOf("href", "target", "rel", "class", "title")
    )

    fun validate(memberId: UUID, document: JsonNode?) {
        if (document == null || document.isNull) return
        require(document.isObject && document.propertyNames().toSet() == setOf("format", "version", "content")) { "에디터 문서 형식을 확인해주세요." }
        require(document.get("format").isString && document.get("format").asString() == "shnea-editor" && document.get("version").isIntegralNumber && document.get("version").asInt() == 3) { "지원하지 않는 에디터 문서 버전입니다." }
        val root = document.get("content")
        require(root?.isObject == true && root.get("type")?.isString == true && root.get("type").asString() == "doc") { "에디터 문서의 최상위 구조를 확인해주세요." }
        val attachmentIds = mutableSetOf<UUID>()
        var nodes = 0

        fun visit(node: JsonNode, depth: Int) {
            require(depth <= 32 && ++nodes <= 20000) { "에디터 문서가 너무 크거나 깊습니다." }
            require(node.isObject && node.propertyNames().all { it in setOf("type", "attrs", "content", "marks", "text") }) { "에디터 문서 구조를 확인해주세요." }
            val type = node.get("type")
            require(type != null && type.isString) { "본문 유형이 필요합니다." }
            val name = type.asString()
            require(name in blocks || name in inline || name in setOf("doc", "listItem", "taskItem", "tableRow", "tableCell", "tableHeader")) { "지원하지 않는 본문 유형입니다." }
            val attrs = node.get("attrs")
            if (attrs != null) validateAttributes(name, attrs, attachmentIds, memberId)
            require(name !in setOf("attachment", "mediaRow") || attrs != null) { "첨부 정보가 필요합니다." }
            val text = node.get("text")
            require(text == null || (name == "text" && text.isString && text.asString().isNotEmpty())) { "본문 텍스트를 확인해주세요." }
            require(name != "text" || text != null) { "본문 텍스트가 필요합니다." }
            val children = node.get("content")
            require(children == null || children.isArray) { "본문 항목은 배열이어야 합니다." }
            val childTypes = mutableListOf<String>()
            if (children != null) {
                for (child in children) {
                    val childType = child.get("type")
                    require(childType != null && childType.isString) { "본문 유형이 필요합니다." }
                    childTypes.add(childType.asString())
                }
            }
            when (name) {
                "doc", "blockquote", "tableCell", "tableHeader" -> require(childTypes.isNotEmpty() && childTypes.all { it in blocks })
                "paragraph", "heading" -> require(childTypes.all { it in inline })
                "codeBlock" -> require(childTypes.all { it == "text" })
                "bulletList", "orderedList" -> require(childTypes.isNotEmpty() && childTypes.all { it == "listItem" })
                "taskList" -> require(childTypes.isNotEmpty() && childTypes.all { it == "taskItem" })
                "listItem", "taskItem" -> require(childTypes.firstOrNull() == "paragraph" && childTypes.drop(1).all { it in blocks })
                "table" -> require(childTypes.isNotEmpty() && childTypes.all { it == "tableRow" })
                "tableRow" -> require(childTypes.all { it in setOf("tableCell", "tableHeader") })
                "mediaRow" -> require(childTypes.size in 1..3 && requireNotNull(children).all { it.get("type")?.asString() == "attachment" && it.get("attrs")?.get("kind")?.asString() in setOf("image", "video") })
                else -> require(childTypes.isEmpty())
            }
            val marks = node.get("marks")
            if (marks != null) {
                require(marks.isArray && marks.size() <= 6 && name in inline) { "본문 서식을 확인해주세요." }
                for (mark in marks) {
                    require(mark.isObject && mark.propertyNames().all { it in setOf("type", "attrs") })
                    val markType = mark.get("type")
                    require(markType != null && markType.isString) { "본문 서식 유형을 확인해주세요." }
                    val markName = markType.asString()
                    require(markName in setOf("bold", "italic", "underline", "strike", "code", "link")) { "지원하지 않는 본문 서식입니다." }
                    val markAttrs = mark.get("attrs")
                    if (markAttrs != null) validateAttributes(requireNotNull(markName), markAttrs, attachmentIds, memberId)
                    require(markName != "link" || markAttrs != null) { "링크 주소가 필요합니다." }
                }
            }
            if (children != null) for (child in children) visit(child, depth + 1)
        }

        visit(requireNotNull(root), 0)
    }

    private fun validateAttributes(type: String, attrs: JsonNode, ids: MutableSet<UUID>, memberId: UUID) {
        require(attrs.isObject && attrs.propertyNames().all { it in attributes[type].orEmpty() }) { "지원하지 않는 본문 속성입니다." }
        for ((key, value) in attrs.properties()) {
            if (value.isNull) continue
            if (key == "colwidth") {
                require(value.isArray && value.size() <= 100 && value.all { it.isIntegralNumber && it.asInt() in 0..10000 })
            } else {
                require(value.isString || value.isNumber || value.isBoolean) { "본문 속성을 확인해주세요." }
                if (value.isString) require(value.asString().length <= 10000)
                if (value.isNumber) require(value.asDouble().isFinite())
            }
        }
        for ((key, range) in mapOf("level" to 1..6, "start" to 1..1000000, "colspan" to 1..100, "rowspan" to 1..100, "widthPercent" to 25..100)) {
            val value = attrs.get(key)
            if (value != null) require(value.isIntegralNumber && value.asInt() in range)
        }
        val align = attrs.get("align")
        if (align != null && !align.isNull) require(align.isString && align.asString() in if (type == "attachment") setOf("left", "center", "right") else setOf("left", "right", "center", "justify"))
        val checked = attrs.get("checked")
        if (checked != null) require(checked.isBoolean)
        for (key in listOf("language", "title", "type", "source", "alt")) {
            val value = attrs.get(key)
            if (value != null && !value.isNull) require(value.isString)
        }
        if (type == "link") {
            val href = attrs.get("href")
            require(href != null && href.isString && safeLink(href.asString())) { "안전한 링크 주소를 입력해주세요." }
            val target = attrs.get("target")
            require(target == null || target.isNull || target.asString() == "_blank")
            val rel = attrs.get("rel")
            require(rel == null || rel.asString() == "noopener noreferrer nofollow")
            require(attrs.get("class") == null || attrs.get("class").isNull)
        }
        if (type == "externalImage") {
            val source = attrs.get("source")?.asString().orEmpty()
            require(!Regex("^\\s*(data|blob|javascript):", RegexOption.IGNORE_CASE).containsMatchIn(source)) { "외부 이미지 경로를 확인해주세요." }
        }
        if (type in setOf("attachment", "mediaRow")) {
            require(ids.add(UUID.fromString(requiredString(attrs, "id")))) { "첨부 식별자가 중복되었습니다." }
        }
        if (type == "attachment") {
            val fileId = UUID.fromString(requiredString(attrs, "fileId"))
            require(requiredString(attrs, "scope").isNotBlank() && requiredString(attrs, "name").isNotBlank())
            val kind = requiredString(attrs, "kind")
            require(kind in setOf("image", "file", "video", "audio"))
            val size = attrs.get("size")
            require(size != null && size.isIntegralNumber && size.asLong() in 0..5000000000L)
            if (kind !in setOf("image", "video")) {
                require(attrs.get("widthPercent") == null || attrs.get("widthPercent").asInt() == 100)
                require(align == null || align.asString() == "center")
            }
            require(jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id = ? AND member_id = ? AND cleanup_started_at IS NULL", Int::class.java, fileId, memberId) == 1) { "본인의 첨부 파일만 사용할 수 있습니다." }
        }
    }

    private fun requiredString(attrs: JsonNode, key: String): String {
        val value = attrs.get(key)
        require(value != null && value.isString && value.asString().length <= 1000) { "첨부 정보를 확인해주세요." }
        return value.asString()
    }

    private fun safeLink(value: String): Boolean {
        if (value.any { it.isWhitespace() || it.code < 32 || it.code == 127 }) return false
        return try { URI(value).scheme in setOf("https", "http", "mailto", "tel") } catch (_: IllegalArgumentException) { false } catch (_: java.net.URISyntaxException) { false }
    }
}

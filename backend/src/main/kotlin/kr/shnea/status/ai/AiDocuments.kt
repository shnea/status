package kr.shnea.status.ai

import kr.shnea.status.portfolio.PortfolioDocument
import tools.jackson.databind.JsonNode

data class AiDocument(val id: String, val title: String, val content: String, val metadata: Map<String, String>)
data class AiSource(val id: String, val title: String, val url: String)

object AiDocuments {
    fun from(document: PortfolioDocument, slug: String): List<AiDocument> {
        val public = document.publicProjection()
        val chunks = mutableListOf<AiDocument>()
        val base = "/@" + slug
        fun add(id: String, title: String, url: String, value: String) {
            val text = value.trim()
            if (text.isEmpty()) return
            // Independent immutable generations use upsert batches; no split replace_all.
            text.chunked(6000).forEachIndexed { index, part ->
                chunks.add(AiDocument("$id-$index", title.take(512), part,
                    mapOf("source_id" to id, "url" to url)))
            }
        }
        add("profile", public.profile.name, base,
            listOf(public.profile.name, public.profile.title, public.profile.introduction, text(public.profile.about),
                public.profile.contacts.joinToString("\n") { it.label + ": " + it.value }).joinToString("\n"))
        add("skills", "스킬", "$base#skills", public.skills.joinToString("\n") { it.category + ": " + it.name })
        public.projects.forEach { project ->
            add("project-" + project.id, project.title, "$base/projects/${project.id}",
                listOf(project.title, project.role, project.summary, text(project.content),
                    public.skills.filter { it.id in project.skillIds }.joinToString(", ") { it.name },
                    project.links.joinToString("\n") { it.label + ": " + it.value }).joinToString("\n"))
        }
        public.history.forEach { history ->
            add("history-" + history.id, history.title, "$base#history",
                listOf(history.title, history.organization, history.role, history.startMonth,
                    if (history.ongoing) "진행 중" else history.endMonth, history.summary, text(history.content)).joinToString("\n"))
        }
        public.certifications.forEach { cert ->
            add("certification-" + cert.id, cert.name, "$base#certifications",
                listOf(cert.name, cert.issuer, cert.issuedOn, cert.expiresOn, cert.credentialId, cert.url).joinToString("\n"))
        }
        require(chunks.size <= 10000) { "검색 문서가 플랫폼의 최대 10,000개를 초과합니다." }
        return chunks
    }

    private fun text(node: JsonNode?): String {
        if (node == null || node.isNull) return ""
        if (node.get("type")?.asString() == "text") return node.get("text")?.asString() ?: ""
        // File payloads, storage references and document attributes are never model inputs.
        val children = node.get("content") ?: node.get("document") ?: return ""
        return if (children.isArray) children.joinToString("\n") { text(it) } else text(children)
    }
}

package kr.shnea.status.admin

import kr.shnea.status.account.Member
import kr.shnea.status.catalog.CreateSkill
import kr.shnea.status.catalog.SearchPage
import kr.shnea.status.catalog.SkillCatalog
import kr.shnea.status.catalog.SkillEntry
import kr.shnea.status.portfolio.IconRef
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

data class SkillChange(val name: String, val category: String, val icon: IconRef, val active: Boolean, val aliases: List<String> = emptyList())

@Service
class AdminCatalog(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val catalog: SkillCatalog, private val admin: AdminService) {
    fun search(query: String, page: Int): SearchPage<SkillEntry> {
        require(query.length <= 100 && page in 0..10000) { "검색 조건을 확인해주세요." }
        val items = jdbc.query(
            """SELECT * FROM skill_dictionary WHERE owner_id IS NULL
               AND position(lower(?) in lower(name || ' ' || category || ' ' || aliases::text)) > 0
               ORDER BY category, lower(name), id LIMIT 31 OFFSET ?""",
            { row, _ -> SkillEntry(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("category"),
                json.readValue(row.getString("icon"), IconRef::class.java), false, row.getBoolean("active"),
                json.readValue(row.getString("aliases"), Array<String>::class.java).toList()) },
            query.trim(), page * 30
        )
        return SearchPage(items.take(30), items.size > 30)
    }

    @Transactional
    fun create(actor: Member, input: CreateSkill): SkillEntry {
        val result = catalog.create(null, input)
        admin.audit(actor.id, null, "skill-create", result.id.toString())
        return result.copy(aliases = input.aliases)
    }

    @Transactional
    fun update(actor: Member, id: UUID, input: SkillChange) {
        val name = input.name.trim()
        val category = input.category.trim()
        require(name.isNotBlank() && name.length <= 100 && category.isNotBlank() && category.length <= 60) { "스킬명과 카테고리를 확인해주세요." }
        require(input.aliases.size <= 100 && input.aliases.all { it.length <= 100 }) { "별칭을 확인해주세요." }
        val icon = catalog.validateIcon(input.icon)
        val changed = jdbc.update(
            "UPDATE skill_dictionary SET name=?, normalized_name=?, category=?, icon=?::jsonb, active=?, aliases=?::jsonb WHERE id=? AND owner_id IS NULL",
            name, name.lowercase(java.util.Locale.ROOT), category, json.writeValueAsString(icon),
            input.active, json.writeValueAsString(input.aliases), id
        )
        if (changed != 1) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        admin.audit(actor.id, null, "skill-update", id.toString())
    }
}

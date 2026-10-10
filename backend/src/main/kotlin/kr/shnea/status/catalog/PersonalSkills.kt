package kr.shnea.status.catalog

import kr.shnea.status.portfolio.IconRef
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

data class PersonalSkillChange(val name: String, val category: String, val icon: IconRef, val active: Boolean)

@Service
class PersonalSkills(private val jdbc: JdbcTemplate, private val json: JsonMapper, private val catalog: SkillCatalog) {
    fun search(owner: UUID, query: String, page: Int): SearchPage<SkillEntry> {
        require(query.length <= 100 && page in 0..10000) { "검색 조건을 확인해주세요." }
        val entries = jdbc.query("""SELECT * FROM skill_dictionary WHERE owner_id=?
            AND position(lower(?) in lower(name || ' ' || category))>0
            ORDER BY category,lower(name),id LIMIT 31 OFFSET ?""", { row, _ ->
                SkillEntry(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("category"),
                    json.readValue(row.getString("icon"), IconRef::class.java), true, row.getBoolean("active"))
            }, owner, query.trim(), page * 30)
        return SearchPage(entries.take(30), entries.size > 30)
    }

    @Transactional
    fun update(owner: UUID, id: UUID, input: PersonalSkillChange): SkillEntry {
        val name = input.name.trim()
        val category = input.category.trim()
        require(name.isNotBlank() && name.length <= 100 && category.isNotBlank() && category.length <= 60) { "스킬명과 카테고리를 확인해주세요." }
        val icon = catalog.validateIcon(input.icon)
        val changed = jdbc.update("""UPDATE skill_dictionary SET name=?,normalized_name=?,category=?,icon=?::jsonb,active=?
            WHERE id=? AND owner_id=?""", name, name.lowercase(java.util.Locale.ROOT), category, json.writeValueAsString(icon), input.active, id, owner)
        if (changed != 1) throw ResponseStatusException(HttpStatus.NOT_FOUND, "본인의 개인 스킬만 수정할 수 있습니다.")
        return SkillEntry(id, name, category, icon, true, input.active)
    }
}

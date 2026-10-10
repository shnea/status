package kr.shnea.status.catalog

import kr.shnea.status.portfolio.IconRef
import kr.shnea.status.portfolio.SelectedSkill
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

data class SkillEntry(val id: UUID, val name: String, val category: String, val icon: IconRef, val personal: Boolean, val active: Boolean = true, val aliases: List<String> = emptyList())
data class CreateSkill(val name: String, val category: String, val icon: IconRef = IconRef(), val aliases: List<String> = emptyList())
data class CatalogIcon(val provider: String = "simple-icons", val key: String, val title: String, val hex: String = "", val monochromeAllowed: Boolean = false)
data class SearchPage<T>(val items: List<T>, val hasMore: Boolean)

@Service
class SkillCatalog(private val jdbc: JdbcTemplate, private val json: JsonMapper) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val resource = ClassPathResource("catalog/simple-icons.json")
        val icons = if (resource.exists()) resource.inputStream.use {
            json.readValue(it, Array<CatalogIcon>::class.java).toList()
        } else emptyList()
        if (icons.isNotEmpty()) {
            jdbc.batchUpdate(
                "INSERT INTO icon_catalog(provider,key,title,hex,monochrome_allowed) VALUES (?,?,?,?,?) ON CONFLICT (provider,key) DO NOTHING",
                icons, 500
            ) { statement, icon ->
                statement.setString(1, icon.provider)
                statement.setString(2, icon.key)
                statement.setString(3, icon.title)
                statement.setString(4, icon.hex)
                statement.setBoolean(5, icon.monochromeAllowed)
            }
        }
        val common = listOf(
            Triple("Kotlin", "언어", "kotlin"), Triple("Java", "언어", ""),
            Triple("JavaScript", "언어", "javascript"), Triple("TypeScript", "언어", "typescript"),
            Triple("Python", "언어", "python"), Triple("Go", "언어", "go"), Triple("Rust", "언어", "rust"),
            Triple("C++", "언어", "cplusplus"), Triple("C#", "언어", ""),
            Triple("HTML", "웹", "html5"), Triple("CSS", "웹", "css"),
            Triple("React", "프런트엔드", "react"), Triple("Next.js", "프런트엔드", "nextdotjs"),
            Triple("Vue.js", "프런트엔드", "vuedotjs"), Triple("Angular", "프런트엔드", "angular"),
            Triple("Spring Boot", "백엔드", "springboot"), Triple("Node.js", "백엔드", "nodedotjs"),
            Triple("PostgreSQL", "데이터베이스", "postgresql"), Triple("MySQL", "데이터베이스", "mysql"),
            Triple("Redis", "데이터베이스", "redis"), Triple("MongoDB", "데이터베이스", "mongodb"),
            Triple("Docker", "인프라", "docker"), Triple("Kubernetes", "인프라", "kubernetes"),
            Triple("Git", "도구", "git"), Triple("Linux", "인프라", "linux"),
            Triple("AWS", "클라우드", ""), Triple("Azure", "클라우드", ""),
            Triple("Google Cloud", "클라우드", "googlecloud"),
            Triple("시스템 설계", "설계", ""), Triple("협업", "업무", "")
        )
        for ((name, category, iconKey) in common) {
            val icon = findIcon("simple-icons", iconKey) ?: IconRef()
            jdbc.update(
                "INSERT INTO skill_dictionary(id,name,normalized_name,category,icon) VALUES (?,?,?,?,?::jsonb) ON CONFLICT DO NOTHING",
                UUID.randomUUID(), name, normalize(name), category, json.writeValueAsString(icon)
            )
        }
        jdbc.batchUpdate(
            """INSERT INTO skill_dictionary(id,name,normalized_name,category,icon) VALUES (?,?,?,?,?::jsonb)
               ON CONFLICT (owner_id,normalized_name) DO NOTHING""",
            icons, 500
        ) { statement, icon ->
            statement.setObject(1, UUID.randomUUID())
            statement.setString(2, icon.title)
            statement.setString(3, normalize(icon.title))
            statement.setString(4, "브랜드 · 도구")
            statement.setString(5, json.writeValueAsString(IconRef(icon.provider, icon.key, icon.hex, icon.monochromeAllowed)))
        }
    }

    fun search(ownerId: UUID, query: String, page: Int): SearchPage<SkillEntry> {
        require(page in 0..10000 && query.length <= 100) { "검색 조건을 확인해주세요." }
        val needle = "%" + query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        val items = jdbc.query(
            """SELECT s.* FROM skill_dictionary s
               WHERE (s.owner_id IS NULL OR s.owner_id = ?) AND s.active
                 AND (s.name ILIKE ? OR s.category ILIKE ? OR s.aliases::text ILIKE ?)
                 AND (s.owner_id IS NOT NULL OR NOT EXISTS
                     (SELECT 1 FROM skill_dictionary p WHERE p.owner_id = ? AND p.active AND p.normalized_name = s.normalized_name))
               ORDER BY s.category, lower(s.name), s.id LIMIT 31 OFFSET ?""",
            { row, _ -> SkillEntry(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("category"),
                json.readValue(row.getString("icon"), IconRef::class.java), row.getObject("owner_id") != null, row.getBoolean("active")) },
            ownerId, needle, needle, needle, ownerId, page * 30
        )
        return SearchPage(items.take(30), items.size > 30)
    }

    fun icons(query: String, page: Int): SearchPage<CatalogIcon> {
        require(page in 0..10000 && query.length <= 100) { "검색 조건을 확인해주세요." }
        val needle = "%" + query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        val items = jdbc.query(
            "SELECT * FROM icon_catalog WHERE title ILIKE ? OR key ILIKE ? ORDER BY lower(title), key LIMIT 31 OFFSET ?",
            { row, _ -> CatalogIcon(row.getString("provider"), row.getString("key"), row.getString("title"), row.getString("hex"), row.getBoolean("monochrome_allowed")) },
            needle, needle, page * 30
        )
        return SearchPage(items.take(30), items.size > 30)
    }

    @Transactional
    fun create(ownerId: UUID?, input: CreateSkill): SkillEntry {
        val name = input.name.trim()
        val category = input.category.trim()
        require(name.isNotBlank() && name.length <= 100 && category.isNotBlank() && category.length <= 60) { "스킬명과 카테고리를 입력해주세요." }
        require(input.aliases.size <= 100 && input.aliases.all { it.length <= 100 }) { "별칭이 너무 깁니다." }
        val icon = validateIcon(input.icon)
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO skill_dictionary(id,owner_id,name,normalized_name,category,icon,aliases) VALUES (?,?,?,?,?,?::jsonb,?::jsonb)",
            id, ownerId, name, normalize(name), category, json.writeValueAsString(icon), json.writeValueAsString(input.aliases)
        )
        return SkillEntry(id, name, category, icon, ownerId != null)
    }

    fun resolve(ownerId: UUID, selected: SelectedSkill, previousIds: Set<UUID>): SelectedSkill {
        val item = jdbc.query(
            "SELECT * FROM skill_dictionary WHERE id = ? AND (owner_id IS NULL OR owner_id = ?)",
            { row, _ -> SkillEntry(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("category"),
                json.readValue(row.getString("icon"), IconRef::class.java), row.getObject("owner_id") != null, row.getBoolean("active")) },
            selected.id, ownerId
        ).firstOrNull() ?: throw IllegalArgumentException("사용할 수 없는 스킬입니다.")
        require(item.active || item.id in previousIds) { "신규 선택이 중단된 스킬입니다." }
        return SelectedSkill(item.id, item.name, item.category, item.icon, selected.featured)
    }

    fun validateIcon(input: IconRef): IconRef {
        if (input.provider == "initials") return IconRef()
        if (input.provider == "lucide") {
            require(input.key in setOf("code", "terminal", "database", "cloud", "network", "users", "layers", "palette", "shield", "briefcase", "link", "mail", "phone", "globe")) { "기본 아이콘을 확인해주세요." }
            return IconRef("lucide", input.key)
        }
        return findIcon(input.provider, input.key) ?: throw IllegalArgumentException("아이콘을 찾을 수 없습니다.")
    }

    private fun findIcon(provider: String, key: String): IconRef? {
        return jdbc.query(
            "SELECT * FROM icon_catalog WHERE provider = ? AND key = ?",
            { row, _ -> IconRef(row.getString("provider"), row.getString("key"), row.getString("hex"), row.getBoolean("monochrome_allowed")) },
            provider, key
        ).firstOrNull()
    }

    private fun normalize(name: String): String = name.trim().lowercase(java.util.Locale.ROOT)
}

package kr.shnea.status.portfolio

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

data class DesignSetting(val id: String, val title: String, val enabled: Boolean, val implemented: Boolean, val isDefault: Boolean)

@Service
class TemplateCatalog(private val jdbc: JdbcTemplate) {
    fun all(): List<DesignSetting> {
        return jdbc.query("SELECT * FROM template_settings ORDER BY is_default DESC,id",
            { row, _ -> DesignSetting(row.getString("id"), row.getString("title"), row.getBoolean("enabled"),
                row.getBoolean("implemented"), row.getBoolean("is_default")) })
    }

    fun defaultId(): String {
        return jdbc.queryForObject("SELECT id FROM template_settings WHERE is_default AND enabled AND implemented", String::class.java)
            ?: throw IllegalStateException("Default portfolio template is unavailable")
    }
}

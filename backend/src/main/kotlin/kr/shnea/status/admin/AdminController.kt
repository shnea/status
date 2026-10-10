package kr.shnea.status.admin

import kr.shnea.status.account.Accounts
import kr.shnea.status.files.FileCleanup
import kr.shnea.status.files.FileReview
import kr.shnea.status.portfolio.DesignSetting
import kr.shnea.status.portfolio.TemplateCatalog
import kr.shnea.status.catalog.CreateSkill
import kr.shnea.status.catalog.SearchPage
import kr.shnea.status.catalog.SkillEntry
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/admin")
class AdminController(private val accounts: Accounts, private val service: AdminService, private val catalog: AdminCatalog, private val settings: AdminSettings, private val templates: TemplateCatalog, private val files: FileCleanup, private val icons: AdminIcons) {
    @GetMapping("/overview")
    fun overview(auth: Authentication): Overview { accounts.requireAdmin(auth); return service.overview() }

    @GetMapping("/users")
    fun users(auth: Authentication, @RequestParam(defaultValue = "") q: String, @RequestParam(defaultValue = "0") page: Int): List<AdminUser> {
        accounts.requireAdmin(auth)
        return service.users(q, page)
    }

    @PutMapping("/users/{id}/suspension")
    fun suspend(auth: Authentication, @PathVariable id: UUID, @RequestBody input: Suspension) {
        service.suspend(accounts.requireAdmin(auth), id, input)
    }

    @PutMapping("/users/{id}/ai")
    fun ai(auth: Authentication, @PathVariable id: UUID, @RequestBody input: AiPermission) {
        service.aiPermission(accounts.requireAdmin(auth), id, input.enabled)
    }

    @GetMapping("/designs")
    fun designs(auth: Authentication): List<DesignSetting> { accounts.requireAdmin(auth); return templates.all() }

    @PutMapping("/designs/{id}")
    fun design(auth: Authentication, @PathVariable id: String, @RequestBody input: DesignChange) {
        service.design(accounts.requireAdmin(auth), id, input)
    }

    @GetMapping("/skills")
    fun skills(auth: Authentication, @RequestParam(defaultValue = "") q: String, @RequestParam(defaultValue = "0") page: Int): SearchPage<SkillEntry> {
        accounts.requireAdmin(auth)
        return catalog.search(q, page)
    }

    @PostMapping("/skills")
    fun createSkill(auth: Authentication, @RequestBody input: CreateSkill): SkillEntry {
        return catalog.create(accounts.requireAdmin(auth), input)
    }

    @PutMapping("/skills/{id}")
    fun updateSkill(auth: Authentication, @PathVariable id: UUID, @RequestBody input: SkillChange) {
        catalog.update(accounts.requireAdmin(auth), id, input)
    }

    @PostMapping("/icons")
    fun createIcon(auth: Authentication, @RequestBody input: IconRegistration): kr.shnea.status.catalog.CatalogIcon {
        return icons.create(accounts.requireAdmin(auth), input)
    }

    @GetMapping("/settings")
    fun settings(auth: Authentication): SystemSettings { accounts.requireAdmin(auth); return settings.settings() }

    @PutMapping("/settings")
    fun updateSettings(auth: Authentication, @RequestBody input: SystemSettings) { settings.update(accounts.requireAdmin(auth), input) }

    @GetMapping("/ai/usage")
    fun usage(auth: Authentication): AiUsage { accounts.requireAdmin(auth); return settings.usage() }

    @GetMapping("/files/review")
    fun files(auth: Authentication, @RequestParam(defaultValue = "0") page: Int): FileReview {
        accounts.requireAdmin(auth)
        return files.review(page)
    }
    @GetMapping("/audit")
    fun audit(auth: Authentication): List<AuditEntry> { accounts.requireAdmin(auth); return service.auditEntries() }
}

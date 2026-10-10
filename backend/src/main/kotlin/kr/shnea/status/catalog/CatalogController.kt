package kr.shnea.status.catalog

import kr.shnea.status.account.Accounts
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/catalog")
class CatalogController(private val catalog: SkillCatalog, private val accounts: Accounts, private val personal: PersonalSkills) {
    @GetMapping("/skills")
    fun skills(authentication: Authentication, @RequestParam(defaultValue = "") q: String, @RequestParam(defaultValue = "0") page: Int): SearchPage<SkillEntry> {
        return catalog.search(accounts.requireActive(authentication).id, q, page)
    }

    @GetMapping("/personal-skills")
    fun personal(auth: Authentication, @RequestParam(defaultValue = "") q: String, @RequestParam(defaultValue = "0") page: Int): SearchPage<SkillEntry> = personal.search(accounts.requireActive(auth).id, q, page)

    @PutMapping("/skills/{id}")
    fun update(auth: Authentication, @PathVariable id: java.util.UUID, @RequestBody input: PersonalSkillChange): SkillEntry = personal.update(accounts.requireActive(auth).id, id, input)

    @GetMapping("/icons")
    fun icons(@RequestParam(defaultValue = "") q: String, @RequestParam(defaultValue = "0") page: Int): SearchPage<CatalogIcon> {
        return catalog.icons(q, page)
    }

    @PostMapping("/skills")
    fun create(authentication: Authentication, @RequestBody input: CreateSkill): SkillEntry {
        return catalog.create(accounts.requireActive(authentication).id, input)
    }
}

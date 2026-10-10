package kr.shnea.status.portfolio

import kr.shnea.status.account.Accounts
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api")
class PortfolioController(private val service: PortfolioService, private val accounts: Accounts, private val templates: TemplateCatalog) {
    @GetMapping("/public/designs")
    fun publicDesigns(): ResponseEntity<List<DesignSetting>> {
        return privateResponse(templates.all().filter { it.enabled && it.implemented })
    }

    @GetMapping("/portfolio/designs")
    fun designs(authentication: Authentication): ResponseEntity<List<DesignSetting>> {
        accounts.requireActive(authentication)
        return privateResponse(templates.all())
    }

    @GetMapping("/portfolio")
    fun draft(authentication: Authentication): ResponseEntity<DraftView> {
        return privateResponse(service.draft(accounts.requireActive(authentication).id))
    }

    @PutMapping("/portfolio")
    fun save(authentication: Authentication, @RequestBody input: SaveDraft): ResponseEntity<DraftView> {
        return privateResponse(service.save(accounts.requireActive(authentication).id, input))
    }

    @PostMapping("/portfolio/publish")
    fun publish(authentication: Authentication, @RequestBody input: PublishDraft): ResponseEntity<DraftView> {
        return privateResponse(service.publish(accounts.requireActive(authentication).id, input.revision))
    }

    @PostMapping("/portfolio/unpublish")
    fun unpublish(authentication: Authentication): ResponseEntity<DraftView> {
        return privateResponse(service.unpublish(accounts.requireActive(authentication).id))
    }

    @PutMapping("/portfolio/slug")
    fun slug(authentication: Authentication, @RequestBody input: ChangeSlug): ResponseEntity<DraftView> {
        return privateResponse(service.changeSlug(accounts.requireActive(authentication).id, input.slug))
    }

    @PutMapping("/portfolio/ai-consent")
    fun consent(authentication: Authentication, @RequestBody input: AiConsent): ResponseEntity<DraftView> {
        return privateResponse(service.consent(accounts.requireActive(authentication).id, input.enabled))
    }

    @GetMapping("/public/portfolios/{slug}")
    fun publicPortfolio(@PathVariable slug: String): ResponseEntity<PublicPortfolio> {
        return privateResponse(service.publicPortfolio(slug))
    }

    @GetMapping("/public/portfolios/{slug}/projects/{id}")
    fun project(@PathVariable slug: String, @PathVariable id: UUID): ResponseEntity<Project> {
        return privateResponse(service.publicProject(slug, id))
    }

    private fun <T : Any> privateResponse(body: T): ResponseEntity<T> {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body)
    }
}

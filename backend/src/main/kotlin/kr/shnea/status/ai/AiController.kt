package kr.shnea.status.ai

import jakarta.servlet.http.HttpServletRequest
import kr.shnea.status.account.Accounts
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import java.util.UUID

data class AiSwitch(val enabled: Boolean)
data class ReindexRequest(val memberId: UUID? = null)
data class AiAdministration(val enabled: Boolean, val jobs: List<IndexJob>, val summary: Map<String, Long>, val batches: List<ReindexBatch>)
data class ReindexResult(val queued: Int)

@RestController
class AiController(private val chat: AiChat, private val index: AiIndex, private val accounts: Accounts) {
    @PostMapping("/api/public/portfolios/{slug}/ai")
    fun ask(@PathVariable slug: String, @RequestBody input: AskAi, request: HttpServletRequest): ResponseEntity<AiReply> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(chat.ask(slug, input, request))

    @GetMapping("/api/public/portfolios/{slug}/ai/{id}")
    fun reply(@PathVariable slug: String, @PathVariable id: UUID, request: HttpServletRequest): ResponseEntity<AiReply> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(chat.reply(slug, id, request))

    @PostMapping("/api/public/portfolios/{slug}/ai/{id}/cancel")
    fun cancel(@PathVariable slug: String, @PathVariable id: UUID, request: HttpServletRequest): ResponseEntity<AiReply> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(chat.cancel(slug, id, request))

    @GetMapping("/api/admin/ai")
    fun admin(auth: Authentication): AiAdministration {
        accounts.requireAdmin(auth)
        return AiAdministration(index.enabled(), index.jobs(), index.summary(), index.batches())
    }

    @PostMapping("/api/admin/ai/jobs/{id}/recover")
    fun recover(auth: Authentication, @PathVariable id: UUID) { index.recover(accounts.requireAdmin(auth), id) }

    @PutMapping("/api/admin/ai/enabled")
    fun toggle(auth: Authentication, @RequestBody input: AiSwitch) { index.toggle(accounts.requireAdmin(auth), input.enabled) }

    @PostMapping("/api/admin/ai/reindex")
    fun reindex(auth: Authentication, @RequestBody input: ReindexRequest): ReindexResult =
        ReindexResult(index.enqueue(accounts.requireAdmin(auth), input.memberId))
}

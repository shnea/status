package kr.shnea.status.statistics

import jakarta.servlet.http.HttpServletRequest
import kr.shnea.status.account.Accounts
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
class StatisticsController(private val statistics: Statistics, private val accounts: Accounts) {
    @PostMapping("/api/public/portfolios/{slug}/visit")
    fun visit(@PathVariable slug: String, @RequestBody input: VisitEvent, authentication: Authentication?, request: HttpServletRequest): ResponseEntity<Void> {
        statistics.record(slug, input, authentication, request)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }

    @GetMapping("/api/admin/statistics")
    fun report(authentication: Authentication, @RequestParam(defaultValue = "30") days: Int, @RequestParam(required = false) memberId: UUID?): ResponseEntity<StatisticsReport> {
        accounts.requireAdmin(authentication)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statistics.report(days, memberId))
    }
}

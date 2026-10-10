package kr.shnea.status.config

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class SiteController(private val settings: SiteSettings) {
    @GetMapping("/api/public/site")
    fun settings(): ResponseEntity<PublicSiteSettings> {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(settings.publicSettings())
    }
}

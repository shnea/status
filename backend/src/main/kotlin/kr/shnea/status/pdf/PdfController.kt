package kr.shnea.status.pdf

import kr.shnea.status.account.Accounts
import kr.shnea.status.files.PlatformFiles
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
class PdfController(private val accounts: Accounts, private val jobs: PdfJobs, private val renderer: PdfRenderer, private val platform: PlatformFiles) {
    @PostMapping("/api/portfolio/pdf")
    fun export(authentication: Authentication, @RequestBody input: ExportPdf): ResponseEntity<ByteArray> {
        val owner = accounts.requireActive(authentication)
        val job = jobs.create(owner.id, input)
        try {
            val pdf = renderer.render(job)
            accounts.requireActive(authentication)
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_PDF)
                .header("Content-Disposition", "attachment; filename=\"status-portfolio.pdf\"")
                .header("X-Content-Type-Options", "nosniff").body(pdf)
        } finally { jobs.remove(job.id) }
    }

    @GetMapping("/api/pdf/render/{id}")
    fun document(@PathVariable id: UUID, @RequestHeader(name = "Authorization", required = false) authorization: String?): ResponseEntity<PrintDocument> {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(jobs.find(id, authorization).view)
    }

    @GetMapping("/api/pdf/render/{id}/files/{fileId}/content/preview")
    fun image(@PathVariable id: UUID, @PathVariable fileId: UUID, @RequestHeader(name = "Authorization", required = false) authorization: String?): ResponseEntity<ByteArray> {
        jobs.file(id, authorization, fileId)
        val content = platform.content(fileId, "preview", null)
        jobs.file(id, authorization, fileId)
        val type = content.headers.firstValue("Content-Type").orElse("")
        if (type !in setOf("image/png", "image/jpeg", "image/webp")) throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "출력할 이미지를 확인해주세요.")
        return ResponseEntity.status(content.status).cacheControl(CacheControl.noStore()).header("Content-Type", type)
            .header("X-Content-Type-Options", "nosniff").body(content.bytes)
    }
}

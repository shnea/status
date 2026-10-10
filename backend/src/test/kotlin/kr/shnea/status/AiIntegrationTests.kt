package kr.shnea.status

import com.sun.net.httpserver.HttpServer
import kr.shnea.status.account.Accounts
import kr.shnea.status.ai.*
import kr.shnea.status.config.AppSettings
import kr.shnea.status.portfolio.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockCookie
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@SpringBootTest(properties = [
    "status.ai-worker-enabled=false", "status.file-cleanup-enabled=false", "status.environment=local", "status.public-url=http://localhost:30165",
    "status.platform-base-url=https://platform.example.test", "status.platform-key=test-only-key",
    "status.issuer=https://issuer.example.test", "status.redirect-uri=http://localhost:30165/callback",
    "status.logout-redirect-uri=http://localhost:30165/", "status.secure-cookie=false",
    "status.admin-issuer=https://issuer.example.test", "status.admin-subject=admin", "status.file-retention-code=영구"
])
@AutoConfigureMockMvc
@Import(TestOidcConfiguration::class, AiHttpFixture::class)
class AiIntegrationTests {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var repository: PortfolioRepository
    @Autowired lateinit var accounts: Accounts
    @Autowired lateinit var index: AiIndex

    companion object {
        @JvmStatic @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
            require(url.endsWith("/status_test"))
            registry.add("spring.datasource.url") { url }
        }
    }

    @BeforeEach fun reset() {
        assertEquals("status_test", jdbc.queryForObject("SELECT current_database()", String::class.java))
        jdbc.execute("TRUNCATE members CASCADE")
        jdbc.execute("TRUNCATE ai_reindex_batches CASCADE")
        jdbc.update("UPDATE system_settings SET value='true'::jsonb WHERE key='ai_enabled'")
        jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_limits'", """{"sessionDaily":10,"portfolioDaily":100,"globalDaily":1000,"sessionMinute":3}""")
        AiHttpFixture.reset()
    }

    private fun portfolio(subject: String, document: PortfolioDocument = PortfolioDocument(profile = Profile(name = subject, introduction = "Kotlin 백엔드"))): PortfolioRecord {
        val response = mvc.perform(get("/api/portfolio").with(oidcLogin().idToken { it.issuer("https://issuer.example.test").subject(subject) }))
            .andExpect(status().isOk).andReturn().response
        val view = json.readValue(response.contentAsString, DraftView::class.java)
        val record = requireNotNull(repository.byOwner(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, view.id)!!))
        jdbc.update("UPDATE members SET ai_allowed=true WHERE id=?", record.memberId)
        jdbc.update("UPDATE portfolios SET ai_consent=true WHERE id=?", record.id)
        repository.publish(record, document.publicProjection())
        return requireNotNull(repository.byOwner(record.memberId))
    }

    private fun ready(record: PortfolioRecord) {
        repeat(10) { if (index.ready(record) == null) index.tick() }
        assertTrue(index.ready(record) != null)
    }

    private data class Visitor(val cookie: MockCookie, val csrf: String)
    private fun visitor(): Visitor {
        val response = mvc.perform(get("/api/session")).andExpect(status().isOk).andReturn().response
        return Visitor(MockCookie.parse(requireNotNull(response.getHeader("Set-Cookie"))), json.readTree(response.contentAsString).get("csrfToken").asString())
    }

    private fun ask(record: PortfolioRecord, visitor: Visitor, input: AskAi) =
        mvc.perform(post("/api/public/portfolios/${record.slug}/ai").cookie(visitor.cookie)
            .header("X-CSRF-TOKEN", visitor.csrf).contentType("application/json").content(json.writeValueAsString(input)))

    @Test fun cancellationRequiresTheSameVisitorAndCsrfAndSuppressesLateAnswersAfterRevocation() {
        val record = portfolio("owner")
        ready(record)
        val first = visitor()
        val second = visitor()
        val input = AskAi(UUID.randomUUID(), "기술은?")
        ask(record, first, input).andExpect(status().isOk)
        val job = AiHttpFixture.jobs.keys.single()
        AiHttpFixture.jobs[job] = AiHttpFixture.jobs.getValue(job) + ("status" to "running")
        val endpoint = "/api/public/portfolios/${record.slug}/ai/${input.requestId}/cancel"
        mvc.perform(post(endpoint).cookie(first.cookie)).andExpect(status().isForbidden)
        mvc.perform(post(endpoint).cookie(second.cookie).header("X-CSRF-TOKEN", second.csrf)).andExpect(status().isNotFound)
        assertEquals(0, AiHttpFixture.cancelCalls)
        jdbc.update("UPDATE portfolios SET ai_consent=false WHERE id=?", record.id)
        mvc.perform(post(endpoint).cookie(first.cookie).header("X-CSRF-TOKEN", first.csrf))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelling"))
        mvc.perform(get(endpoint.removeSuffix("/cancel")).cookie(first.cookie))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelling"))
        assertEquals(1, AiHttpFixture.cancelCalls)
        AiHttpFixture.jobs[job] = AiHttpFixture.jobs.getValue(job) + ("status" to "succeeded")
        mvc.perform(get(endpoint.removeSuffix("/cancel")).cookie(first.cookie))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelled"))
            .andExpect(jsonPath("$.answer").doesNotExist()).andExpect(jsonPath("$.sources").isEmpty)
        jdbc.update("UPDATE portfolios SET ai_consent=true WHERE id=?", record.id)
        ask(record, first, input).andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelled"))
        assertEquals(1, AiHttpFixture.modelCalls)
    }

    @Test fun cancellationDuringSearchPreventsModelSubmission() {
        val record = portfolio("owner")
        ready(record)
        val first = visitor()
        val input = AskAi(UUID.randomUUID(), "접수 중 취소")
        AiHttpFixture.beforeSearch = {
            mvc.perform(post("/api/public/portfolios/${record.slug}/ai/${input.requestId}/cancel")
                .cookie(first.cookie).header("X-CSRF-TOKEN", first.csrf))
                .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelling"))
        }
        ask(record, first, input).andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelled"))
        assertEquals(0, AiHttpFixture.modelCalls)
        assertEquals(0, AiHttpFixture.cancelCalls)
    }

    @Test fun uncertainSubmissionIsRecoveredForCancellationWithoutStartingAnotherModel() {
        val record = portfolio("owner")
        ready(record)
        val first = visitor()
        val input = AskAi(UUID.randomUUID(), "접수 유실 후 취소")
        AiHttpFixture.uncertain = true
        ask(record, first, input).andExpect(status().isServiceUnavailable)
        val job = AiHttpFixture.jobs.keys.single()
        AiHttpFixture.jobs[job] = AiHttpFixture.jobs.getValue(job) + ("status" to "running")
        mvc.perform(post("/api/public/portfolios/${record.slug}/ai/${input.requestId}/cancel")
            .cookie(first.cookie).header("X-CSRF-TOKEN", first.csrf))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelling"))
        AiHttpFixture.jobs[job] = AiHttpFixture.jobs.getValue(job) + ("status" to "cancelled")
        mvc.perform(get("/api/public/portfolios/${record.slug}/ai/${input.requestId}").cookie(first.cookie))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("cancelled"))
        assertEquals(1, AiHttpFixture.modelCalls)
        assertEquals(1, AiHttpFixture.cancelCalls)
    }

    @Test fun administratorReindexBatchTracksOnlyEligibleDistinctTargets() {
        val first = portfolio("first")
        val second = portfolio("second")
        jdbc.update("UPDATE portfolios SET ai_consent=false WHERE id=?", second.id)
        fun admin() = oidcLogin().idToken { it.issuer("https://issuer.example.test").subject("admin") }
        mvc.perform(post("/api/admin/ai/reindex").with(admin()).with(csrf()).contentType("application/json").content("{}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.queued").value(1))
        mvc.perform(post("/api/admin/ai/reindex").with(admin()).with(csrf()).contentType("application/json").content("{}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.queued").value(0))
        ready(first)
        val response = mvc.perform(get("/api/admin/ai").with(admin())).andExpect(status().isOk).andReturn().response
        val batches = json.readTree(response.contentAsString).get("batches").toList()
        assertEquals(1, batches.sumOf { it.get("targets").asInt() })
        assertEquals(1, batches.sumOf { it.get("completed").asInt() })
        assertEquals(0, batches.sumOf { it.get("failed").asInt() + it.get("pending").asInt() })
        assertTrue(index.ready(second) == null)
    }

    @Test fun anonymousConcurrentRequestsCannotExceedSharedLimits() {
        val record = portfolio("owner")
        ready(record)
        jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_limits'", """{"sessionDaily":1,"portfolioDaily":1,"globalDaily":1,"sessionMinute":1}""")
        val visitor = visitor()
        val executor = java.util.concurrent.Executors.newFixedThreadPool(6)
        try {
            val results = (1..6).map { executor.submit<Int> {
                ask(record, visitor, AskAi(UUID.randomUUID(), "동시 질문")).andReturn().response.status
            } }.map { it.get() }
            assertEquals(1, results.count { it == 200 })
            assertEquals(5, results.count { it == 429 })
            assertEquals(1, AiHttpFixture.modelCalls)
        } finally { executor.shutdownNow() }
    }

    @Test fun emptySearchDoesNotRunModelAndOldGenerationsAreRetired() {
        val record = portfolio("owner")
        ready(record)
        AiHttpFixture.empty = true
        val visitor = visitor()
        ask(record, visitor, AskAi(UUID.randomUUID(), "없는 내용")).andExpect(status().isOk)
            .andExpect(jsonPath("$.answer").value("공개된 자료에서 확인할 수 없습니다."))
        assertEquals(0, AiHttpFixture.modelCalls)
        jdbc.update("UPDATE portfolios SET ai_consent=false WHERE id=?", record.id)
        index.tick()
        assertTrue(index.jobs().all { it.cleanupState == "retired" })
        assertTrue(AiHttpFixture.collections.values.all { it.isEmpty() })
        mvc.perform(put("/api/admin/ai/enabled").with(oidcLogin().idToken { it.issuer("https://issuer.example.test").subject("admin") })
            .contentType("application/json").content("""{"enabled":false}""")).andExpect(status().isForbidden)
    }

    @Test fun generationsUseBoundedUpsertsAndExcludePrivateData() {
        val content = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"긴 자기소개"}]}]}}""")
        val record = portfolio("first", PortfolioDocument(profile = Profile(name = "공개 이름", about = content,
            contacts = listOf(Contact(value = "private-email", visible = false))),
            projects = listOf(Project(title = "공개 프로젝트", summary = "Kotlin", content = json.readTree(
                json.writeValueAsString(mapOf("content" to mapOf("type" to "text", "text" to "문".repeat(6000 * 105)))))),
                Project(title = "비공개 프로젝트", visible = false)),
            certifications = listOf(Certification(name = "공개 자격", credentialId = "private-credential")),
            history = listOf(History(title = "비공개 경력", visible = false))))
        ready(record)
        val texts = AiHttpFixture.indexBodies.joinToString()
        assertTrue(texts.contains("긴 자기소개"))
        assertFalse(texts.contains("private-email") || texts.contains("private-credential") || texts.contains("비공개 프로젝트") || texts.contains("비공개 경력"))
        assertTrue(AiHttpFixture.indexBodies.size >= 4)
        assertTrue(AiHttpFixture.indexBodies.all { json.readTree(it).get("mode").asString() == "upsert" && json.readTree(it).get("documents").size() <= 30 })
        assertEquals(1, AiHttpFixture.collections.size)
    }

    @Test fun searchRejectsForeignDocumentsAndStopsResultsAfterRevocation() {
        val first = portfolio("first")
        val second = portfolio("second")
        ready(first); ready(second)
        val visitor = visitor()
        AiHttpFixture.foreign = true
        ask(first, visitor, AskAi(UUID.randomUUID(), "기술은?")).andExpect(status().isServiceUnavailable)
        assertEquals(0, AiHttpFixture.modelCalls)
        AiHttpFixture.foreign = false
        val input = AskAi(UUID.randomUUID(), "기술은?")
        ask(first, visitor, input).andExpect(status().isOk).andExpect(jsonPath("$.status").value("pending"))
        AiHttpFixture.beforeAnswer = { jdbc.update("UPDATE portfolios SET ai_consent=false WHERE id=?", first.id) }
        mvc.perform(get("/api/public/portfolios/${first.slug}/ai/${input.requestId}").cookie(visitor.cookie)).andExpect(status().isForbidden)
        assertEquals(1, AiHttpFixture.modelCalls)
    }

    @Test fun limitsAndRetryIdentityAreEnforcedAcrossRealSessions() {
        val record = portfolio("owner")
        ready(record)
        jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_limits'", """{"sessionDaily":1,"portfolioDaily":1,"globalDaily":1,"sessionMinute":1}""")
        val first = visitor()
        val input = AskAi(UUID.randomUUID(), "기술은?")
        ask(record, first, input).andExpect(status().isOk)
        ask(record, first, input).andExpect(status().isOk).andExpect(jsonPath("$.status").value("completed"))
        assertEquals(1, AiHttpFixture.modelCalls)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM ai_requests", Int::class.java))
        ask(record, first, AskAi(UUID.randomUUID(), "새 질문")).andExpect(status().isTooManyRequests)
        val second = visitor()
        ask(record, second, input).andExpect(status().isConflict)
        mvc.perform(get("/api/public/portfolios/${record.slug}/ai/${input.requestId}").cookie(second.cookie)).andExpect(status().isNotFound)
        ask(record, second, AskAi(UUID.randomUUID(), "새 세션 질문")).andExpect(status().isTooManyRequests)
    }

    @Test fun oldIndexCannotBecomeCurrentAndUncertainSubmissionIsOnlyRecovered() {
        val record = portfolio("owner")
        AiHttpFixture.beforeIndex = {
            jdbc.update("UPDATE portfolios SET published_revision=published_revision+1 WHERE id=?", record.id)
            AiHttpFixture.beforeIndex = null
        }
        repeat(3) { index.tick() }
        assertTrue(index.ready(record) == null)
        val latest = requireNotNull(repository.byOwner(record.memberId))
        ready(latest)
        assertTrue(index.jobs().any { it.status == "superseded" })
        val visitor = visitor()
        val input = AskAi(UUID.randomUUID(), "기술은?")
        AiHttpFixture.uncertain = true
        ask(latest, visitor, input).andExpect(status().isServiceUnavailable)
        mvc.perform(get("/api/public/portfolios/${latest.slug}/ai/${input.requestId}").cookie(visitor.cookie))
            .andExpect(status().isOk).andExpect(jsonPath("$.status").value("completed"))
        assertEquals(1, AiHttpFixture.modelCalls)
        jdbc.update("UPDATE system_settings SET value='false'::jsonb WHERE key='ai_enabled'")
        mvc.perform(get("/api/public/portfolios/${latest.slug}/ai/${input.requestId}").cookie(visitor.cookie)).andExpect(status().isForbidden)
        mvc.perform(post("/api/admin/ai/reindex").with(oidcLogin()).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden)
    }
}

@TestConfiguration
class AiHttpFixture {
    @Bean @Primary fun testPlatformAi(json: JsonMapper): PlatformAi {
        val settings = AppSettings("local", "http://localhost:30165", "http://127.0.0.1:${server.address.port}", UUID.randomUUID(),
            UUID.randomUUID(), "fixture-key", "https://issuer.example.test", "http://localhost:30165/callback", "http://localhost:30165/", secureCookie = false)
        return PlatformAi(settings, json)
    }

    companion object {
        val collections = mutableMapOf<String, MutableList<JsonNode>>()
        val indexBodies = mutableListOf<String>()
        val jobs = mutableMapOf<UUID, Map<String, Any>>()
        var modelCalls = 0
        var cancelCalls = 0
        var beforeSearch: (() -> Unit)? = null
        var empty = false
        var foreign = false
        var uncertain = false
        var beforeAnswer: (() -> Unit)? = null
        var beforeIndex: (() -> Unit)? = null
        private val json = JsonMapper.builder().build()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/api/v1/ai") { exchange ->
                assertEquals("fixture-key", exchange.requestHeaders.getFirst("X-Platform-Key"))
                val path = exchange.requestURI.path.removePrefix("/api/v1/ai")
                val body = if (exchange.requestMethod == "POST") json.readTree(exchange.requestBody.readAllBytes()) else null
                var status = 200
                val response: Any = when {
                    path == "/indexing" -> {
                        beforeIndex?.invoke()
                        indexBodies.add(body.toString())
                        val collection = body!!.get("collection").asString()
                        if (body.get("mode").asString() == "replace_all") collections[collection] = mutableListOf()
                        else collections.getOrPut(collection) { mutableListOf() }.addAll(body.get("documents").toList())
                        mapOf("id" to UUID.randomUUID(), "status" to "succeeded")
                    }
                    path == "/indexing/search" -> {
                        beforeSearch?.invoke()
                        val collection = body!!.get("collection").asString()
                        mapOf("results" to if (empty) emptyList<Map<String,String>>() else if (foreign) listOf(mapOf("document_id" to "foreign-document", "content" to "다른 사용자"))
                            else collections.getValue(collection).take(1).map { mapOf("document_id" to it.get("id").asString(), "content" to it.get("content").asString()) })
                    }
                    path == "/jobs" && body != null -> {
                        modelCalls++
                        val id = UUID.randomUUID()
                        jobs[id] = mapOf("id" to id, "request_id" to body.get("request_id").asString(),
                            "status" to "succeeded", "result" to mapOf("result" to mapOf("output" to "공개된 Kotlin 경험입니다.")))
                        if (uncertain) { uncertain = false; status = 503 }
                        mapOf("id" to id, "status" to "pending")
                    }
                    path == "/jobs" -> jobs.values.toList()
                    path.startsWith("/jobs/") && path.endsWith("/cancel") -> {
                        cancelCalls++
                        mapOf("cancellation_requested" to true, "execution_stopped" to null)
                    }
                    path.startsWith("/jobs/") -> { beforeAnswer?.invoke(); jobs.getValue(UUID.fromString(path.substringAfterLast('/'))) }
                    else -> mapOf("status" to "succeeded")
                }
                val bytes = json.writeValueAsBytes(response)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(status, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            start()
        }
        fun reset() {
            collections.clear(); indexBodies.clear(); jobs.clear(); modelCalls = 0; cancelCalls = 0; beforeSearch = null
            empty = false; foreign = false; uncertain = false; beforeAnswer = null; beforeIndex = null
        }
    }
}

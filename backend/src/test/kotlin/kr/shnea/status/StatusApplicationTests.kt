package kr.shnea.status

import kr.shnea.status.files.PlatformFiles
import kr.shnea.status.files.FileAccess
import kr.shnea.status.account.Accounts
import kr.shnea.status.catalog.SkillCatalog
import kr.shnea.status.portfolio.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
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
@Import(TestOidcConfiguration::class)
class StatusApplicationTests {
    @Autowired lateinit var mvc: MockMvc
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var accounts: Accounts
    @Autowired lateinit var catalog: SkillCatalog
    @Autowired lateinit var fileAccess: FileAccess
    @Autowired lateinit var cleanup: kr.shnea.status.files.FileCleanup
    @Autowired lateinit var uploads: kr.shnea.status.files.FileUploads
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var platformFiles: PlatformFiles
    @Autowired lateinit var siteSettings: kr.shnea.status.config.SiteSettings
    @Autowired lateinit var transactionManager: org.springframework.transaction.PlatformTransactionManager
    @Autowired lateinit var sessions: org.springframework.session.SessionRepository<*>
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var iconSource: kr.shnea.status.admin.SimpleIconSource

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
            require(url.endsWith("/status_test")) { "Tests require the dedicated Docker test database" }
            registry.add("spring.datasource.url") { url }
        }
    }

    @BeforeEach
    fun reset() {
        assertEquals("status_test", jdbc.queryForObject("SELECT current_database()", String::class.java))
        jdbc.execute("TRUNCATE members CASCADE")
        jdbc.update("UPDATE template_settings SET is_default=false")
        jdbc.update("UPDATE template_settings SET enabled=true,implemented=true,is_default=(id='swiss')")
        catalog.run(DefaultApplicationArguments())
    }

    private fun login(subject: String = "owner") = oidcLogin().idToken {
        it.issuer("https://issuer.example.test").subject(subject).claim("given_name", "테스트 사용자")
    }

    private fun draft(subject: String = "owner"): DraftView {
        val result = mvc.perform(get("/api/portfolio").with(login(subject))).andExpect(status().isOk).andReturn()
        return json.readValue(result.response.contentAsString, DraftView::class.java)
    }

    private fun save(current: DraftView, document: PortfolioDocument, subject: String = "owner"): DraftView {
        val result = mvc.perform(put("/api/portfolio").with(login(subject)).with(csrf())
            .contentType("application/json").content(json.writeValueAsString(SaveDraft(current.revision, document))))
            .andExpect(status().isOk).andReturn()
        return json.readValue(result.response.contentAsString, DraftView::class.java)
    }

    private fun publish(current: DraftView) {
        mvc.perform(post("/api/portfolio/publish").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(PublishDraft(current.revision)))).andExpect(status().isOk)
    }



    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "RUN_PLATFORM_FILE_TEST", matches = "true")
    fun actualPlatformImageUploadAndRevokedPublicFileAccess() {
        val initial = draft()
        val ownerId = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id = ?", UUID::class.java, initial.id))
        val settings = kr.shnea.status.config.AppSettings(
            "local", "http://localhost:30165", requireNotNull(System.getenv("PLATFORM_BASE_URL")),
            UUID.fromString(System.getenv("PLATFORM_PROJECT_ID")), UUID.fromString(System.getenv("PLATFORM_ENVIRONMENT_ID")),
            requireNotNull(System.getenv("PLATFORM_API_KEY")), "https://issuer.example.test",
            "http://localhost:30165/callback", "http://localhost:30165/", secureCookie = false,
            fileRetentionCode = requireNotNull(System.getenv("PLATFORM_FILE_RETENTION_CODE")))
        val platform = kr.shnea.status.files.PlatformFiles(settings, json)
        val uploads = kr.shnea.status.files.FileUploads(jdbc, org.springframework.transaction.support.TransactionTemplate(transactionManager), platform, siteSettings)
        val controller = kr.shnea.status.files.FileController(accounts, uploads, fileAccess, platform, siteSettings, kr.shnea.status.files.FileStreams(platform, settings))
        val image = java.awt.image.BufferedImage(32, 32, java.awt.image.BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics()
        graphics.color = java.awt.Color(180, 70, 40)
        graphics.fillRect(0, 0, 32, 32)
        graphics.dispose()
        val stream = java.io.ByteArrayOutputStream()
        javax.imageio.ImageIO.write(image, "png", stream)
        val bytes = stream.toByteArray()
        var createdFile: UUID? = null
        try {
            val requestId = UUID.randomUUID()
            val ref = uploads.upload(ownerId, requestId, "status-file-integration.png", "image", "image/png", bytes)
            createdFile = ref.fileId
            assertEquals(ref, uploads.upload(ownerId, requestId, "status-file-integration.png", "image", "image/png", bytes))
            var ready = false
            for (attempt in 0 until 60) {
                val state = platform.views(ref.fileId)
                if (state.get("state").asString() == "READY") {
                    assertEquals("IMAGE", state.get("kind").asString())
                    ready = true
                    break
                }
                check(state.get("state").asString() !in setOf("FAILED", "UNSUPPORTED")) { "Platform image processing failed" }
                Thread.sleep(1000)
            }
            assertTrue(ready, "Platform image processing did not finish")
            val saved = save(initial, initial.document.copy(profile = initial.document.profile.copy(imageId = ref.fileId)))
            publish(saved)
            val views = requireNotNull(controller.publicViews(saved.id, ref.fileId).body)
            assertTrue(views.previewUrl?.endsWith("/content/preview") == true)
            assertTrue(views.thumbnailUrl?.endsWith("/content/thumbnail") == true)
            assertTrue(views.originalUrl.endsWith("/content/original"))
            for (variant in listOf("preview", "thumbnail", "original")) {
                val response = controller.publicContent(saved.id, ref.fileId, variant, null)
                assertTrue(response.statusCode.is2xxSuccessful)
                assertTrue(response.headers.contentType?.toString()?.startsWith("image/") == true)
                assertTrue(requireNotNull(response.body).isNotEmpty())
                if (variant == "original") assertEquals(PlatformFiles.hash(bytes), PlatformFiles.hash(requireNotNull(response.body)))
            }
            mvc.perform(post("/api/portfolio/unpublish").with(login()).with(csrf())).andExpect(status().isOk)
            val denied = kotlin.test.assertFailsWith<org.springframework.web.server.ResponseStatusException> {
                controller.publicContent(saved.id, ref.fileId, "preview", null)
            }
            assertEquals(404, denied.statusCode.value())
        } finally {
            if (createdFile != null) {
                platform.deleteUnused(createdFile)
                platform.deleteUnused(createdFile)
            }
        }
    }
    @Test
    fun fileAccessUsesOnlyTheCurrentPublicSnapshotAndActiveOwner() {
        val initial = draft()
        val other = draft("other")
        val ownerId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id = ?", UUID::class.java, initial.id)
        val firstFile = UUID.randomUUID()
        val hiddenFile = UUID.randomUUID()
        for (id in listOf(firstFile, hiddenFile)) {
            jdbc.update("INSERT INTO uploaded_files(id,member_id,original_name,media_type,size) VALUES (?,?,?,'image/png',67)",
                id, ownerId, "test.png")
        }
        val saved = save(initial, initial.document.copy(profile = initial.document.profile.copy(imageId = firstFile),
            projects = listOf(Project(title = "숨긴 이미지", imageId = hiddenFile, visible = false))))
        mvc.perform(get("/api/public/files/${saved.id}/$firstFile/views")).andExpect(status().isNotFound)
        publish(saved)
        fileAccess.requirePublic(saved.id, firstFile)
        fileAccess.requireOwner(requireNotNull(ownerId), firstFile)
        mvc.perform(get("/api/public/files/${saved.id}/$hiddenFile/views")).andExpect(status().isNotFound)
        mvc.perform(get("/api/public/files/${other.id}/$firstFile/views")).andExpect(status().isNotFound)
        mvc.perform(get("/api/files/$firstFile/views").with(login("other"))).andExpect(status().isNotFound)
        mvc.perform(get("/api/files/$firstFile/content/invalid").with(login())).andExpect(status().isBadRequest)
        mvc.perform(get("/api/files/$firstFile/content/original").header("Range", "bytes=0-1,3-4").with(login()))
            .andExpect(status().isBadRequest)
        val next = save(saved, saved.document.copy(profile = saved.document.profile.copy(imageId = null)))
        fileAccess.requirePublic(saved.id, firstFile)
        publish(next)
        mvc.perform(get("/api/public/files/${saved.id}/$firstFile/views")).andExpect(status().isNotFound)
        val restored = save(next, next.document.copy(profile = next.document.profile.copy(imageId = firstFile)))
        publish(restored)
        jdbc.update("UPDATE members SET suspended = true WHERE id = ?", ownerId)
        mvc.perform(get("/api/files/$firstFile/views").with(login())).andExpect(status().isForbidden)
        mvc.perform(get("/api/public/files/${saved.id}/$firstFile/content/preview")).andExpect(status().isNotFound)
    }

    @Test
    fun uploadWithInvalidCsrfReturnsARecoverableErrorBeforeCallingTheFileService() {
        val image = MockMultipartFile("file", "test.png", "image/png", byteArrayOf(1))
        mvc.perform(multipart("/api/files").file(image)
            .param("requestId", UUID.randomUUID().toString()).with(login()).with(csrf().useInvalidToken()))
            .andExpect(status().isForbidden)
            .andExpect(content().contentTypeCompatibleWith("application/json"))
            .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"))
        org.mockito.Mockito.verifyNoInteractions(platformFiles)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM file_upload_requests", Int::class.java))
    }

    @Test
    fun imageUploadRejectsInvalidBytesAndConflictingRequestOwnersBeforePlatformCalls() {
        val owner = draft()
        val other = draft("other")
        val invalid = MockMultipartFile("file", "fake.png", "image/png", "<script>unsafe</script>".toByteArray())
        mvc.perform(multipart("/api/files").file(invalid).param("requestId", UUID.randomUUID().toString()).with(login()).with(csrf()))
            .andExpect(status().isBadRequest)
        mvc.perform(multipart("/api/files").file(invalid).param("requestId", UUID.randomUUID().toString()).with(login()))
            .andExpect(status().isForbidden)
        val requestId = UUID.randomUUID()
        val ownerId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id = ?", UUID::class.java, owner.id)
        jdbc.update("""INSERT INTO file_upload_requests(request_id,member_id,original_name,sha256,media_type,kind,size)
            VALUES (?,?,? ,?,'image/png','image',67)""", requestId, ownerId, "test.png", "0".repeat(64))
        val bytes = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6LV0AAAAASUVORK5CYII=")
        val image = MockMultipartFile("file", "test.png", "image/png", bytes)
        mvc.perform(multipart("/api/files").file(image).param("requestId", requestId.toString()).with(login("other")).with(csrf()))
            .andExpect(status().isConflict)
        mvc.perform(multipart("/api/files").file(image).param("requestId", requestId.toString()).with(login()).with(csrf()))
            .andExpect(status().isConflict)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM uploaded_files", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM file_upload_requests", Int::class.java))
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM portfolios", Int::class.java))
        assertTrue(other.id != owner.id)
    }
    @Test
    fun publicDesignCatalogContainsOnlySelectableTemplates() {
        mvc.perform(get("/api/public/designs")).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.length()").value(5))
            .andExpect(jsonPath("$[0].id").value("swiss"))
        try {
            jdbc.update("UPDATE template_settings SET enabled=false WHERE id='swiss'")
            mvc.perform(get("/api/public/designs")).andExpect(status().isOk)
                .andExpect(jsonPath("$.length()").value(4))
        } finally {
            jdbc.update("UPDATE template_settings SET enabled=true WHERE id='swiss'")
        }
    }

    @Test
    fun simultaneousSessionAttributesDoNotBlockNavigation() {
        @Suppress("UNCHECKED_CAST")
        val repository = sessions as org.springframework.session.SessionRepository<org.springframework.session.Session>
        val session = repository.createSession()
        session.setAttribute("stable", "keep-existing-session")
        repository.save(session)
        try {
            val first = requireNotNull(repository.findById(session.id))
            val second = requireNotNull(repository.findById(session.id))
            first.setAttribute("login-state-test", "first-request")
            second.setAttribute("login-state-test", "second-request")
            repository.save(first)
            repository.save(second)
            val saved = requireNotNull(repository.findById(session.id))
            assertEquals("second-request", saved.getAttribute<String>("login-state-test"))
            assertEquals("keep-existing-session", saved.getAttribute<String>("stable"))
        } finally {
            repository.deleteById(session.id)
        }
    }

    @Test
    fun startingWhileLoggedInGoesDirectlyToDashboard() {
        mvc.perform(get("/oauth2/authorization/platform").with(login()))
            .andExpect(status().isFound)
            .andExpect(redirectedUrl("http://localhost:30165/dashboard"))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM members", Int::class.java))
        val anonymous = mvc.perform(get("/oauth2/authorization/platform"))
            .andExpect(status().isFound).andReturn()
        assertTrue(requireNotNull(anonymous.response.redirectedUrl).startsWith("https://issuer.example.test/auth?"))
        assertTrue(requireNotNull(anonymous.response.redirectedUrl).contains("code_challenge_method=S256"))
    }

    @Test
    fun concurrentFirstLoginCreatesExactlyOneMemberAndPortfolio() {
        val now = Instant.now()
        val token = OidcIdToken("test-only-token", now, now.plusSeconds(300),
            mapOf("iss" to "https://issuer.example.test", "sub" to "concurrent", "given_name" to "동시 가입"))
        val user = DefaultOidcUser(listOf(SimpleGrantedAuthority("OIDC_USER")), token)
        val pool = Executors.newFixedThreadPool(4)
        try {
            val requests = (1..12).map { pool.submit<UUID> { accounts.provision(user).id } }
            assertEquals(1, requests.map { it.get() }.toSet().size)
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM members", Int::class.java))
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM portfolios", Int::class.java))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun draftSaveDoesNotChangePublishedSnapshotAndStaleSaveConflicts() {
        val initial = draft()
        val first = save(initial, initial.document.copy(profile = Profile(name = "공개 이름")))
        publish(first)
        val second = save(first, first.document.copy(profile = Profile(name = "새 초안")))
        mvc.perform(get("/api/public/portfolios/${first.slug}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.document.profile.name").value("공개 이름"))
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(first.revision, first.document))))
            .andExpect(status().isConflict)
        assertEquals("새 초안", draft().document.profile.name)
        publish(second)
        mvc.perform(get("/api/public/portfolios/${first.slug}")).andExpect(jsonPath("$.document.profile.name").value("새 초안"))
    }

    @Test
    fun hiddenDataNeverAppearsInPublicSnapshotOrDirectDetail() {
        val initial = draft()
        val hiddenId = UUID.randomUUID()
        val document = initial.document.copy(
            profile = Profile(name = "작성자", contacts = listOf(Contact(type = "email", value = "private@example.test", visible = false))),
            projects = listOf(Project(title = "공개"), Project(id = hiddenId, title = "비밀 프로젝트", visible = false)),
            history = listOf(History(title = "비밀 히스토리")),
            certifications = listOf(Certification(name = "공개 자격", credentialId = "private-credential")),
            sections = listOf(SectionSetting("skills"), SectionSetting("projects"), SectionSetting("history", false), SectionSetting("certifications"))
        )
        val saved = save(initial, document)
        publish(saved)
        val result = mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.document.projects.length()").value(1))
            .andExpect(jsonPath("$.document.history.length()").value(0))
            .andExpect(jsonPath("$.document.profile.contacts.length()").value(0))
            .andExpect(jsonPath("$.document.certifications[0].credentialId").value("")).andReturn()
        assertFalse(result.response.contentAsString.contains("private@example.test"))
        assertFalse(result.response.contentAsString.contains("비밀 프로젝트"))
        mvc.perform(get("/api/public/portfolios/${saved.slug}/projects/$hiddenId")).andExpect(status().isNotFound)
    }

    @Test
    fun unfinishedItemsInHiddenSectionsDoNotBlockPublication() {
        val initial = draft()
        val hiddenProject = Project()
        val saved = save(initial, initial.document.copy(
            projects = listOf(hiddenProject),
            history = listOf(History()),
            certifications = listOf(Certification()),
            sections = initial.document.sections.map { it.copy(visible = it.id == "skills") }
        ))
        publish(saved)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isOk)
            .andExpect(jsonPath("$.document.projects.length()").value(0))
            .andExpect(jsonPath("$.document.history.length()").value(0))
            .andExpect(jsonPath("$.document.certifications.length()").value(0))
        mvc.perform(get("/api/public/portfolios/${saved.slug}/projects/${hiddenProject.id}")).andExpect(status().isNotFound)
        assertEquals(saved.document, draft().document)

        for (section in listOf("projects", "history", "certifications")) {
            val visible = save(draft(), saved.document.copy(
                sections = saved.document.sections.map { if (it.id == section) it.copy(visible = true) else it }
            ))
            mvc.perform(post("/api/portfolio/publish").with(login()).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(PublishDraft(visible.revision)))).andExpect(status().isBadRequest)
            mvc.perform(get("/api/public/portfolios/${saved.slug}"))
                .andExpect(jsonPath("$.revision").value(saved.revision))
        }
    }

    @Test
    fun invalidCalendarValuesAndMalformedUrlsReturnValidationErrorsWithoutReplacingDraft() {
        val initial = draft()
        val cases = listOf(
            initial.document.copy(history = listOf(History(startMonth = "2026-13"))) to "연월을 확인해주세요.",
            initial.document.copy(history = listOf(History(endMonth = "2026-00"))) to "연월을 확인해주세요.",
            initial.document.copy(certifications = listOf(Certification(issuedOn = "2026-02-30"))) to "날짜를 확인해주세요.",
            initial.document.copy(certifications = listOf(Certification(expiresOn = "2026-1-01"))) to "날짜를 확인해주세요.",
            initial.document.copy(profile = initial.document.profile.copy(
                contacts = listOf(Contact(value = "https://example.test/broken link")))) to "http 또는 https 링크를 입력해주세요.",
            initial.document.copy(certifications = listOf(Certification(url = "https://[invalid"))) to "http 또는 https 링크를 입력해주세요."
        )
        for ((document, message) in cases) {
            mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(SaveDraft(initial.revision, document))))
                .andExpect(status().isBadRequest).andExpect(jsonPath("$.message").value(message))
            assertEquals(initial, draft())
        }
    }

    @Test
    fun featuredLimitIsEnforcedAndAnotherOwnersSkillIsRejected() {
        val initial = draft()
        val ids = jdbc.query("SELECT id FROM skill_dictionary LIMIT 11", { row, _ -> row.getObject(1, UUID::class.java) })
        val tooMany = initial.document.copy(skills = ids.map { SelectedSkill(it, featured = true) })
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(0, tooMany)))).andExpect(status().isBadRequest)
        val another = draft("another")
        val memberId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, another.id)
        val privateSkill = catalog.create(memberId, kr.shnea.status.catalog.CreateSkill("나의 기술", "업무"))
        val invalid = initial.document.copy(skills = listOf(SelectedSkill(privateSkill.id)))
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(0, invalid)))).andExpect(status().isBadRequest)
        assertEquals(0, draft().revision)
    }

    @Test
    fun simpleIconsBecomeSkillsWithoutOverwritingCatalogChanges() {
        val icons = org.springframework.core.io.ClassPathResource("catalog/simple-icons.json").inputStream.use {
            json.readValue(it, Array<kr.shnea.status.catalog.CatalogIcon>::class.java).toList()
        }
        val expected = icons.map { it.title.trim().lowercase(java.util.Locale.ROOT) }.toSet()
        val actual = jdbc.query("SELECT normalized_name FROM skill_dictionary WHERE owner_id IS NULL",
            { row, _ -> row.getString(1) }).toSet()
        assertTrue(actual.containsAll(expected), "Every bundled Simple Icons title must be registered as a common skill")
        assertEquals("언어", jdbc.queryForObject("SELECT category FROM skill_dictionary WHERE owner_id IS NULL AND normalized_name='kotlin'", String::class.java))
        val original = jdbc.queryForMap("SELECT * FROM skill_dictionary WHERE owner_id IS NULL AND normalized_name='figma'")
        val id = original["id"]
        try {
            jdbc.update("UPDATE skill_dictionary SET category=?,active=false,aliases='[\"사용자 분류\"]'::jsonb WHERE id=?", "직접 분류", id)
            catalog.run(DefaultApplicationArguments())
            val retained = jdbc.queryForMap("SELECT * FROM skill_dictionary WHERE id=?", id)
            assertEquals("직접 분류", retained["category"])
            assertEquals(false, retained["active"])
            assertEquals(original["icon"].toString(), retained["icon"].toString())
            assertTrue(retained["aliases"].toString().contains("사용자 분류"))
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM skill_dictionary WHERE owner_id IS NULL AND normalized_name='figma'", Int::class.java))
            val owner = draft()
            val ownerId = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, owner.id))
            assertTrue(catalog.search(ownerId, "", 0).hasMore)
            val personal = catalog.create(ownerId, kr.shnea.status.catalog.CreateSkill("Figma", "내 도구"))
            assertEquals(listOf(personal.id), catalog.search(ownerId, "Figma", 0).items.filter { it.name == "Figma" }.map { it.id })
            val saved = save(owner, owner.document.copy(skills = listOf(SelectedSkill(personal.id))))
            assertEquals(personal.id, saved.document.skills.single().id)
        } finally {
            jdbc.update("UPDATE skill_dictionary SET category=?,active=?,aliases=?::jsonb WHERE id=?",
                original["category"], original["active"], original["aliases"].toString(), id)
        }
    }

    @Test
    fun personalNameOverridesCommonSearchAndSelectionMetadataCannotBeForged() {
        val initial = draft()
        val ownerId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id)
        val personal = catalog.create(ownerId, kr.shnea.status.catalog.CreateSkill(" kotlin ", "나의 언어"))
        val results = catalog.search(requireNotNull(ownerId), "Kotlin", 0)
        assertEquals(listOf(personal.id), results.items.map { it.id })
        val saved = save(initial, initial.document.copy(skills = listOf(SelectedSkill(personal.id, name = "위조된 이름"))))
        assertEquals("kotlin", saved.document.skills.first().name)
    }

    @Test
    fun suspensionBlocksExistingSessionAndPublicAccessAndRestoreDoesNotRepublish() {
        val initial = draft()
        val saved = save(initial, initial.document.copy(profile = Profile(name = "작성자")))
        publish(saved)
        val memberId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, saved.id)
        mvc.perform(put("/api/admin/users/$memberId/suspension").with(login("admin")).with(csrf())
            .contentType("application/json").content("""{"suspended":true,"reason":"운영 점검"}""")).andExpect(status().isOk)
        mvc.perform(get("/api/portfolio").with(login())).andExpect(status().isForbidden)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isNotFound)
        mvc.perform(put("/api/admin/users/$memberId/suspension").with(login("admin")).with(csrf())
            .contentType("application/json").content("""{"suspended":false}""")).andExpect(status().isOk)
        mvc.perform(get("/api/portfolio").with(login())).andExpect(status().isOk)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isNotFound)
    }

    @Test
    fun publicAddressIsFixedAndLegacyAliasStillPointsAtTheCurrentPortfolio() {
        val initial = draft()
        publish(initial)
        jdbc.update("INSERT INTO slug_aliases(slug,portfolio_id) VALUES ('legacy-address',?)", initial.id)
        mvc.perform(put("/api/portfolio/slug").with(login()).with(csrf()).contentType("application/json")
            .content("""{"slug":"new-address"}""")).andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("PUBLIC_ADDRESS_FIXED"))
        mvc.perform(get("/api/public/portfolios/legacy-address"))
            .andExpect(status().isOk).andExpect(jsonPath("$.canonicalSlug").value(initial.slug))
        assertEquals(initial.slug, draft().slug)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM slug_aliases WHERE slug='new-address'", Int::class.java))
        mvc.perform(put("/api/portfolio/slug").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(ChangeSlug(initial.slug)))).andExpect(status().isOk)
    }

    @Test
    fun personalSkillChangesPreserveSelectionAndPublishedSnapshotAndRejectOtherOwners() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val personal = catalog.create(owner, kr.shnea.status.catalog.CreateSkill("내 스킬", "업무"))
        val selected = initial.document.copy(profile = initial.document.profile.copy(name = "작성자"),
            skills = listOf(SelectedSkill(personal.id, featured = true)),
            projects = listOf(Project(title = "연결 프로젝트", skillIds = listOf(personal.id))))
        val saved = save(initial, selected)
        publish(saved)
        val body = """{"name":"수정된 개인 스킬","category":"설계","icon":{"provider":"lucide","key":"layers"},"active":false}"""
        mvc.perform(put("/api/catalog/skills/${personal.id}").with(login("other")).with(csrf())
            .contentType("application/json").content(body)).andExpect(status().isNotFound)
        mvc.perform(put("/api/catalog/skills/${personal.id}").with(login()).contentType("application/json").content(body))
            .andExpect(status().isForbidden)
        mvc.perform(put("/api/catalog/skills/${personal.id}").with(login()).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk).andExpect(jsonPath("$.active").value(false))
        mvc.perform(get("/api/catalog/personal-skills?q=수정된").with(login())).andExpect(jsonPath("$.items[0].id").value(personal.id.toString()))
        mvc.perform(get("/api/catalog/personal-skills?q=수정된").with(login("other"))).andExpect(jsonPath("$.items").isEmpty)
        mvc.perform(get("/api/catalog/skills?q=수정된").with(login())).andExpect(jsonPath("$.items").isEmpty)
        val updated = save(saved, saved.document)
        assertEquals(personal.id, updated.document.projects.single().skillIds.single())
        assertEquals("수정된 개인 스킬", updated.document.skills.single().name)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(jsonPath("$.document.skills[0].name").value("내 스킬"))
        publish(updated)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(jsonPath("$.document.skills[0].name").value("수정된 개인 스킬"))
        val common = catalog.create(null, kr.shnea.status.catalog.CreateSkill("공용 수정 제한", "업무"))
        mvc.perform(put("/api/catalog/skills/${common.id}").with(login()).with(csrf()).contentType("application/json").content(body)).andExpect(status().isNotFound)
    }

    @Test
    fun onlyExactAdministratorIssuerAndSubjectCanManageUsers() {
        val administrator = draft("admin")
        mvc.perform(get("/api/session").with(login("admin")))
            .andExpect(status().isOk).andExpect(jsonPath("$.admin").value(true))
        mvc.perform(get("/api/admin/overview").with(login("admin"))).andExpect(status().isOk)
        val sameSubjectDifferentIssuer = oidcLogin().idToken {
            it.issuer("https://other-issuer.example.test").subject("admin")
        }
        mvc.perform(get("/api/admin/overview").with(sameSubjectDifferentIssuer)).andExpect(status().isForbidden)
        mvc.perform(get("/api/session").with(sameSubjectDifferentIssuer)).andExpect(jsonPath("$.admin").value(false))
        val administratorId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, administrator.id)
        mvc.perform(put("/api/admin/users/$administratorId/suspension").with(login("admin")).with(csrf())
            .contentType("application/json").content("""{"suspended":true,"reason":"self suspension"}"""))
            .andExpect(status().isBadRequest)
    }
    @Test
    fun selfIntroductionCanMoveAndHideWithoutChangingThePublishedDraft() {
        val initial = draft()
        assertEquals(setOf("about", "skills", "projects", "history", "certifications"), initial.document.sections.map { it.id }.toSet())
        val about = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"위치를 바꾸는 자기소개"}]}]}}""")
        val order = listOf("about", "projects", "skills", "history", "certifications")
        val saved = save(initial, initial.document.copy(
            profile = initial.document.profile.copy(about = about),
            sections = order.map { SectionSetting(it) }
        ))
        assertEquals(order, draft().document.sections.map { it.id })
        publish(saved)
        mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(jsonPath("$.document.sections[0].id").value("about"))

        val hidden = save(saved, saved.document.copy(sections = saved.document.sections.map {
            if (it.id == "about") it.copy(visible = false) else it
        }))
        assertEquals(about, draft().document.profile.about)
        mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(jsonPath("$.document.profile.about.content.content[0].content[0].text").value("위치를 바꾸는 자기소개"))
        publish(hidden)
        val result = mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isOk).andReturn()
        val public = json.readValue(result.response.contentAsString, PublicPortfolio::class.java)
        assertTrue(public.document.profile.about?.isNull != false)
        assertFalse(result.response.contentAsString.contains("위치를 바꾸는 자기소개"))
        assertFalse(kr.shnea.status.ai.AiDocuments.from(public.document, saved.slug).any { it.content.contains("위치를 바꾸는 자기소개") })
        assertEquals(about, draft().document.profile.about)

        val restored = save(hidden, hidden.document.copy(sections = order.reversed().map { SectionSetting(it) }, template = "premium-dark"))
        publish(restored)
        assertEquals(order.reversed(), draft().document.sections.map { it.id })
        mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(jsonPath("$.document.sections[4].id").value("about"))
            .andExpect(jsonPath("$.document.profile.about.content.content[0].content[0].text").value("위치를 바꾸는 자기소개"))
    }

    @Test
    fun legacySelfIntroductionKeepsItsPositionWithoutRewritingSnapshots() {
        val initial = draft()
        val legacy = initial.document.copy(
            projects = listOf(Project(title = "기존 프로젝트")),
            sections = listOf("certifications", "projects", "history", "skills").map { SectionSetting(it) }
        )
        val encoded = json.writeValueAsString(legacy)
        jdbc.update("UPDATE portfolios SET draft=?::jsonb,published=?::jsonb,published_revision=0,is_public=true WHERE id=?", encoded, encoded, initial.id)
        val expected = listOf("certifications", "projects", "about", "history", "skills")
        assertEquals(expected, draft().document.sections.map { it.id })
        val result = mvc.perform(get("/api/public/portfolios/${initial.slug}")).andExpect(status().isOk).andReturn()
        assertEquals(expected, json.readValue(result.response.contentAsString, PublicPortfolio::class.java).document.sections.map { it.id })
        assertEquals(4, jdbc.queryForObject("SELECT jsonb_array_length(draft->'sections') FROM portfolios WHERE id=?", Int::class.java, initial.id))
        assertEquals(4, jdbc.queryForObject("SELECT jsonb_array_length(published->'sections') FROM portfolios WHERE id=?", Int::class.java, initial.id))
        val saved = save(draft(), legacy)
        assertEquals(expected, saved.document.sections.map { it.id })

        val hiddenProjects = legacy.copy(sections = legacy.sections.map { if (it.id == "projects") it.copy(visible = false) else it })
        jdbc.update("UPDATE portfolios SET draft=?::jsonb WHERE id=?", json.writeValueAsString(hiddenProjects), initial.id)
        assertEquals("about", draft().document.sections.first().id)
    }

    @Test
    fun richSelfIntroductionPersistsSeparatelyInDraftAndPublishedVersions() {
        val initial = draft()
        val about = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"긴 자기소개","marks":[{"type":"bold"}]}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"나의 경험"}]}]}]}]}}""")
        val saved = save(initial, initial.document.copy(profile = initial.document.profile.copy(about = about)))
        assertEquals(about, draft().document.profile.about)
        publish(saved)
        val changed = json.readTree(about.toString().replace("긴 자기소개", "새 임시 자기소개"))
        val next = save(saved, saved.document.copy(profile = saved.document.profile.copy(about = changed)))
        mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(jsonPath("$.document.profile.about.content.content[0].content[0].text").value("긴 자기소개"))
            .andExpect(jsonPath("$.document.profile.about.content.content[0].content[0].marks[0].type").value("bold"))
        publish(next)
        mvc.perform(get("/api/public/portfolios/${saved.slug}"))
            .andExpect(jsonPath("$.document.profile.about.content.content[0].content[0].text").value("새 임시 자기소개"))
    }

    @Test
    fun malformedEditorDocumentsAndUnsafeLinksDoNotReplaceDraft() {
        val initial = draft()
        for (body in listOf(
            """{"format":{},"version":3,"content":{"type":"doc","content":[{"type":"paragraph"}]}}""",
            """{"format":"shnea-editor","version":null,"content":{"type":"doc","content":[{"type":"paragraph"}]}}""",
            """{"format":"shnea-editor","version":3,"content":{"type":1}}""",
            """{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"잘못된 서식","marks":[{"type":1}]}]}]}}""",
            """{"format":"shnea-editor","version":99,"content":{"type":"doc","content":[{"type":"paragraph"}]}}""",
            """{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"script","text":"alert(1)"}]}}""",
            """{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"위험한 링크","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}}""",
            """{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","attrs":{"onclick":"alert(1)"}}]}}"""
        )) {
            val invalid = initial.document.copy(profile = initial.document.profile.copy(about = json.readTree(body)))
            mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(SaveDraft(initial.revision, invalid))))
                .andExpect(status().isBadRequest)
        }
        assertEquals(initial.revision, draft().revision)
        assertEquals(initial.document.profile.about, draft().document.profile.about)
    }

    @Test
    fun selfIntroductionCannotReferenceAnotherMembersUploadedFile() {
        val initial = draft()
        val another = draft("another")
        val anotherId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, another.id)
        val fileId = UUID.randomUUID()
        jdbc.update("INSERT INTO uploaded_files(id,member_id,original_name,media_type,size) VALUES (?,?,?,'image/png',10)", fileId, anotherId, "private.png")
        val about = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"attachment","attrs":{"id":"${UUID.randomUUID()}","fileId":"$fileId","scope":"another","name":"private.png","kind":"image","size":10}}]}}""")
        val invalid = initial.document.copy(profile = initial.document.profile.copy(about = about))
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(initial.revision, invalid))))
            .andExpect(status().isBadRequest)
    }
    @Test
    fun commonCatalogAdministrationKeepsPersonalSkillsSeparateAndRetainsExistingSelections() {
        val owner = draft()
        val commonName = "Admin skill " + UUID.randomUUID().toString().take(8)
        val body = json.writeValueAsString(kr.shnea.status.catalog.CreateSkill(commonName, "도구"))
        val created = mvc.perform(post("/api/admin/skills").with(login("admin")).with(csrf())
            .contentType("application/json").content(body)).andExpect(status().isOk).andReturn()
        val common = json.readValue(created.response.contentAsString, kr.shnea.status.catalog.SkillEntry::class.java)
        mvc.perform(post("/api/catalog/skills").with(login()).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk)
        mvc.perform(get("/api/admin/skills").param("q", commonName).with(login("admin")))
            .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].personal").value(false))
        mvc.perform(get("/api/admin/skills").with(login())).andExpect(status().isForbidden)
        mvc.perform(post("/api/admin/skills").with(login("admin")).contentType("application/json").content(body))
            .andExpect(status().isForbidden)
        val saved = save(owner, owner.document.copy(skills = listOf(SelectedSkill(common.id))))
        val update = kr.shnea.status.admin.SkillChange(commonName, "도구", common.icon, false, listOf("검색별칭테스트"))
        mvc.perform(put("/api/admin/skills/${common.id}").with(login("admin")).with(csrf())
            .contentType("application/json").content(json.writeValueAsString(update))).andExpect(status().isOk)
        mvc.perform(get("/api/admin/skills").param("q", "검색별칭테스트").with(login("admin")))
            .andExpect(jsonPath("$.items[0].id").value(common.id.toString()))
            .andExpect(jsonPath("$.items[0].active").value(false)).andExpect(jsonPath("$.items[0].aliases[0]").value("검색별칭테스트"))
        save(saved, saved.document)
        val other = draft("other")
        mvc.perform(put("/api/portfolio").with(login("other")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(other.revision, other.document.copy(skills = listOf(SelectedSkill(common.id)))))))
            .andExpect(status().isBadRequest)
        val personalId = jdbc.queryForObject("SELECT id FROM skill_dictionary WHERE owner_id IS NOT NULL AND name=?", UUID::class.java, commonName)
        mvc.perform(put("/api/admin/skills/$personalId").with(login("admin")).with(csrf())
            .contentType("application/json").content(json.writeValueAsString(update))).andExpect(status().isNotFound)
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM admin_audit WHERE action IN ('skill-create','skill-update')", Int::class.java))
        mvc.perform(get("/api/admin/audit").with(login("admin")))
            .andExpect(status().isOk).andExpect(jsonPath("$[0].targetName").value(commonName))
            .andExpect(jsonPath("$[1].targetName").value(commonName))
    }

    @Test
    fun allTemplatesPreserveDraftDataAndRequireExplicitPublication() {
        val initial = draft()
        val saved = save(initial, initial.document.copy(profile = initial.document.profile.copy(name = "작성자"),
            sections = initial.document.sections.reversed().map { if (it.id == "history") it.copy(visible = false) else it }))
        publish(saved)
        val published = draft()
        mvc.perform(get("/api/portfolio/designs").with(login()))
            .andExpect(status().isOk).andExpect(jsonPath("$[0].id").value("swiss"))
            .andExpect(jsonPath("$.length()").value(5))
        mvc.perform(get("/api/portfolio/designs")).andExpect(status().isUnauthorized)
        var current = published
        for (template in listOf("hud", "google-flat", "modern-flat", "premium-dark", "swiss")) {
            current = save(current, current.document.copy(template = template))
            assertEquals(published.document.copy(template = template), current.document)
            assertEquals(published.slug, current.slug)
            assertTrue(current.isPublic)
            assertEquals(published.publishedRevision, current.publishedRevision)
            mvc.perform(get("/api/public/portfolios/${current.slug}"))
                .andExpect(status().isOk).andExpect(jsonPath("$.document.template").value("swiss"))
        }
        current = save(current, current.document.copy(template = "hud"))
        publish(current)
        current = draft()
        mvc.perform(get("/api/public/portfolios/${current.slug}"))
            .andExpect(status().isOk).andExpect(jsonPath("$.document.template").value("hud"))
            .andExpect(jsonPath("$.document.sections[0].id").value("certifications"))
        try {
            jdbc.update("UPDATE template_settings SET enabled=false WHERE id='hud'")
            val unchanged = save(current, current.document)
            assertEquals("hud", unchanged.document.template)
            val swiss = save(unchanged, unchanged.document.copy(template = "swiss"))
            mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(SaveDraft(swiss.revision, swiss.document.copy(template = "hud")))))
                .andExpect(status().isBadRequest)
            assertEquals(swiss, draft())
            jdbc.update("UPDATE template_settings SET enabled=true,implemented=false WHERE id='hud'")
            mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(SaveDraft(swiss.revision, swiss.document.copy(template = "hud")))))
                .andExpect(status().isBadRequest)
        } finally {
            jdbc.update("UPDATE template_settings SET enabled=true,implemented=true WHERE id='hud'")
        }
    }

    @Test
    fun changingTheDefaultTemplateOnlyAffectsNewPortfolios() {
        val owner = draft()
        draft("admin")
        try {
            mvc.perform(put("/api/admin/designs/hud").with(login("admin")).with(csrf()).contentType("application/json")
                .content("""{"enabled":true,"isDefault":true}""")).andExpect(status().isOk)
            assertEquals("hud", draft("new-owner").document.template)
            assertEquals(owner.document, draft().document)
            mvc.perform(put("/api/admin/designs/hud").with(login("admin")).with(csrf()).contentType("application/json")
                .content("""{"enabled":false,"isDefault":false}""")).andExpect(status().isBadRequest)
        } finally {
            jdbc.update("UPDATE template_settings SET is_default=false")
            jdbc.update("UPDATE template_settings SET enabled=true,implemented=true,is_default=(id='swiss')")
        }
    }

    @Test
    fun adminSettingsValidateLimitsAndDesignChangesAndRecordTheActor() {
        draft("admin")
        val configured = """{"aiLimits":{"sessionDaily":11,"portfolioDaily":123,"globalDaily":1234,"sessionMinute":4}}"""
        try {
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json").content(configured))
                .andExpect(status().isOk)
            mvc.perform(get("/api/admin/settings").with(login("admin"))).andExpect(jsonPath("$.aiLimits.sessionDaily").value(11))
            mvc.perform(get("/api/admin/settings").with(login())).andExpect(status().isForbidden)
            mvc.perform(put("/api/admin/settings").with(login("admin")).contentType("application/json").content(configured))
                .andExpect(status().isForbidden)
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(configured.replace("1234", "-1"))).andExpect(status().isBadRequest)
            mvc.perform(get("/api/admin/settings").with(login("admin"))).andExpect(jsonPath("$.aiLimits.globalDaily").value(1234))
            mvc.perform(put("/api/admin/designs/hud").with(login("admin")).with(csrf()).contentType("application/json")
                .content("""{"enabled":false,"isDefault":true}""")).andExpect(status().isBadRequest)
            mvc.perform(put("/api/admin/designs/swiss").with(login("admin")).with(csrf()).contentType("application/json")
                .content("""{"enabled":false,"isDefault":false}""")).andExpect(status().isBadRequest)
            mvc.perform(get("/api/admin/designs").with(login("admin")))
                .andExpect(jsonPath("$[0].id").value("swiss")).andExpect(jsonPath("$[0].isDefault").value(true))
            mvc.perform(get("/api/admin/ai/usage").with(login("admin"))).andExpect(jsonPath("$.total").value(0))
            val actor = jdbc.queryForObject("SELECT id FROM members WHERE subject='admin'", UUID::class.java)
            assertEquals(actor, jdbc.queryForObject("SELECT actor_id FROM admin_audit WHERE action='ai-limits'", UUID::class.java))
        } finally {
            jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='ai_limits'",
                """{"sessionDaily":10,"portfolioDaily":100,"globalDaily":1000,"sessionMinute":3}""")
        }
    }

    @Test
    fun onlyAdministratorCanAddVerifiedCatalogIconsWithoutReplacingExistingMetadata() {
        val key = "fixture" + UUID.randomUUID().toString().replace("-", "")
        val input = kr.shnea.status.admin.IconRegistration("검사 아이콘", key, "#ab12cd")
        val body = json.writeValueAsString(input)
        mvc.perform(post("/api/admin/icons").with(login()).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isForbidden)
        mvc.perform(post("/api/admin/icons").with(login("admin")).contentType("application/json").content(body))
            .andExpect(status().isForbidden)
        mvc.perform(post("/api/admin/icons").with(login("admin")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(input.copy(key = "../other")))).andExpect(status().isBadRequest)
        org.mockito.Mockito.verifyNoInteractions(iconSource)
        mvc.perform(post("/api/admin/icons").with(login("admin")).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isBadRequest)
        org.mockito.Mockito.doReturn(true).`when`(iconSource).exists(key)
        mvc.perform(post("/api/admin/icons").with(login("admin")).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk).andExpect(jsonPath("$.hex").value("AB12CD"))
            .andExpect(jsonPath("$.monochromeAllowed").value(false))
        mvc.perform(post("/api/admin/icons").with(login("admin")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(input.copy(title = "변경 시도")))).andExpect(status().isConflict)
        val found = catalog.icons(key, 0).items.single()
        assertEquals("검사 아이콘", found.title)
        assertEquals("AB12CD", found.hex)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM admin_audit WHERE action='icon-create'", Int::class.java))
        jdbc.update("DELETE FROM icon_catalog WHERE provider='simple-icons' AND key=?", key)
    }

    private fun registeredFile(owner: UUID, name: String = "cleanup-fixture.png"): UUID {
        val id = UUID.randomUUID()
        jdbc.update("""INSERT INTO uploaded_files(id,member_id,original_name,media_type,size,created_at)
            VALUES (?, ?, ?, 'image/png', 100, clock_timestamp()-interval '30 days')""", id, owner, name)
        return id
    }

    private fun ageUnused(id: UUID, interval: String = "8 days") {
        jdbc.update("UPDATE uploaded_files SET unreferenced_since=clock_timestamp()-?::interval WHERE id=?", interval, id)
    }

    @Test
    fun bannerImagesAreOwnedRetainedAcrossTemplatesAndNotPublicOnSwiss() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val portrait = registeredFile(owner, "portrait.png")
        val banner = registeredFile(owner, "banner.png")
        val other = draft("other")
        val foreign = registeredFile(requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, other.id)))
        val saved = save(initial, initial.document.copy(template = "hud",
            profile = initial.document.profile.copy(name = "작성자", title = "나만의 메인 타이틀", imageId = portrait, bannerImageId = banner)))
        publish(saved)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isOk)
            .andExpect(jsonPath("$.document.profile.title").value("나만의 메인 타이틀"))
            .andExpect(jsonPath("$.document.profile.imageId").value(portrait.toString()))
            .andExpect(jsonPath("$.document.profile.bannerImageId").value(banner.toString()))
        fileAccess.requirePublic(saved.id, banner)
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(saved.revision, saved.document.copy(profile = saved.document.profile.copy(bannerImageId = foreign))))))
            .andExpect(status().isBadRequest)
        val swiss = save(saved, saved.document.copy(template = "swiss"))
        publish(swiss)
        assertEquals(banner, draft().document.profile.bannerImageId)
        mvc.perform(get("/api/public/portfolios/${saved.slug}")).andExpect(status().isOk)
            .andExpect(jsonPath("$.document.profile.bannerImageId").doesNotExist())
        assertTrue(banner !in fileAccess.references(swiss.document.publicProjection()))
        cleanup.tick()
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id IN (?,?) AND unreferenced_since IS NOT NULL", Int::class.java, portrait, banner))
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(swiss.revision, swiss.document.copy(profile = swiss.document.profile.copy(title = "제".repeat(201)))))))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun userAiConsentCanOnlyBeEnabledAfterAdministratorPermission() {
        val initial = draft()
        mvc.perform(put("/api/portfolio/ai-consent").with(login()).with(csrf()).contentType("application/json")
            .content("""{"enabled":true}""")).andExpect(status().isForbidden)
        assertFalse(draft().aiConsent)
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        jdbc.update("UPDATE members SET ai_allowed=true WHERE id=?", owner)
        mvc.perform(put("/api/portfolio/ai-consent").with(login()).with(csrf()).contentType("application/json")
            .content("""{"enabled":true}""")).andExpect(status().isOk).andExpect(jsonPath("$.aiConsent").value(true))
        jdbc.update("UPDATE members SET ai_allowed=false WHERE id=?", owner)
        mvc.perform(put("/api/portfolio/ai-consent").with(login()).with(csrf()).contentType("application/json")
            .content("""{"enabled":false}""")).andExpect(status().isOk).andExpect(jsonPath("$.aiConsent").value(false))
    }

    @Test
    fun cleanupWaitsSevenContinuousDaysInsteadOfUsingUploadAge() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val file = registeredFile(owner)
        cleanup.tick()
        assertTrue(jdbc.queryForObject("SELECT unreferenced_since > clock_timestamp()-interval '1 minute' FROM uploaded_files WHERE id=?", Boolean::class.java, file) == true)
        org.mockito.Mockito.verifyNoInteractions(platformFiles)
        ageUnused(file, "6 days 23 hours 59 minutes")
        cleanup.tick()
        org.mockito.Mockito.verifyNoInteractions(platformFiles)
        ageUnused(file, "7 days")
        cleanup.tick()
        org.mockito.Mockito.verify(platformFiles).deleteUnused(file)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE cleanup_completed_at IS NOT NULL", Int::class.java))
        assertEquals(0, cleanup.review(0).items.size)
        mvc.perform(get("/api/files/$file/views").with(login())).andExpect(status().isNotFound)
    }

    @Test
    fun cleanupPreservesHiddenEditorAttachmentsPublishedSnapshotAndSharedImageForSuspendedAccounts() {
        val initial = draft()
        draft("admin")
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val adminId = requireNotNull(jdbc.queryForObject("SELECT id FROM members WHERE subject='admin'", UUID::class.java))
        val ids = List(5) { registeredFile(if (it == 4) adminId else owner) }
        val published = save(initial, initial.document.copy(profile = Profile(name = "작성자", imageId = ids[0])))
        publish(published)
        val attachment = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"attachment","attrs":{"id":"${UUID.randomUUID()}","fileId":"${ids[2]}","scope":"$owner","name":"hidden.png","kind":"image","size":100}}]}}""")
        save(draft(), published.document.copy(profile = Profile(name = "작성자", about = attachment),
            projects = listOf(Project(title = "숨긴 프로젝트", imageId = ids[1], visible = false)),
            history = listOf(History(title = "숨긴 경력", content = attachment, visible = false))))
        val previous = siteSettings.configuration()
        try {
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(kr.shnea.status.admin.SystemSettings(kr.shnea.status.admin.AiLimits(),
                    previous.copy(shareImageId = ids[4]))))).andExpect(status().isOk)
            jdbc.update("UPDATE members SET suspended=true WHERE id=?", owner)
            for (id in ids) ageUnused(id)
            cleanup.tick()
            org.mockito.Mockito.verify(platformFiles).deleteUnused(ids[3])
            for (index in listOf(0, 1, 2, 4)) {
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id=? AND unreferenced_since IS NOT NULL", Int::class.java, ids[index]))
            }
            org.mockito.Mockito.verifyNoMoreInteractions(platformFiles)
        } finally {
            jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='site'", json.writeValueAsString(previous))
        }
    }

    @Test
    fun savingAndRemovingAReferenceBetweenScansResetsItsSevenDays() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val file = registeredFile(owner)
        ageUnused(file)
        val selected = save(initial, initial.document.copy(profile = initial.document.profile.copy(imageId = file)))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id=? AND unreferenced_since IS NOT NULL", Int::class.java, file))
        save(selected, selected.document.copy(profile = selected.document.profile.copy(imageId = null)))
        cleanup.tick()
        org.mockito.Mockito.verifyNoInteractions(platformFiles)
        assertTrue(jdbc.queryForObject("SELECT unreferenced_since > clock_timestamp()-interval '1 minute' FROM uploaded_files WHERE id=?", Boolean::class.java, file) == true)
        draft("admin")
        val adminId = requireNotNull(jdbc.queryForObject("SELECT id FROM members WHERE subject='admin'", UUID::class.java))
        val shared = registeredFile(adminId)
        ageUnused(shared)
        val previous = siteSettings.configuration()
        for (value in listOf(previous.copy(shareImageId = shared), previous)) {
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(kr.shnea.status.admin.SystemSettings(kr.shnea.status.admin.AiLimits(), value))))
                .andExpect(status().isOk)
        }
        cleanup.tick()
        org.mockito.Mockito.verifyNoInteractions(platformFiles)
    }

    @Test
    fun failedDeletionRemainsRetiredAndRetriesWithoutResurrectingAnOldUploadRequest() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val file = registeredFile(owner, "test.png")
        val bytes = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8R8AAAAASUVORK5CYII=")
        val request = UUID.randomUUID()
        jdbc.update("""INSERT INTO file_upload_requests(request_id,member_id,original_name,sha256,media_type,kind,size,file_id)
            VALUES (?,?,'test.png',?,'image/png','image',?,?)""", request, owner, PlatformFiles.hash(bytes), bytes.size, file)
        org.mockito.Mockito.doThrow(IllegalStateException("test-only outage")).doNothing().`when`(platformFiles).deleteUnused(file)
        ageUnused(file)
        cleanup.tick()
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id=? AND cleanup_error='PLATFORM_UNAVAILABLE'", Int::class.java, file))
        mvc.perform(get("/api/files/$file/views").with(login())).andExpect(status().isNotFound)
        mvc.perform(put("/api/portfolio").with(login()).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(SaveDraft(initial.revision, initial.document.copy(profile = initial.document.profile.copy(imageId = file))))))
            .andExpect(status().isBadRequest)
        val retired = kotlin.test.assertFailsWith<org.springframework.web.server.ResponseStatusException> {
            uploads.upload(owner, request, "test.png", "image", "image/png", bytes)
        }
        assertEquals(410, retired.statusCode.value())
        val freshRequest = UUID.randomUUID()
        val freshFile = UUID.randomUUID()
        org.mockito.Mockito.`when`(platformFiles.upload(freshRequest, "test.png", bytes, PlatformFiles.hash(bytes))).thenReturn(freshFile)
        assertEquals(freshFile, uploads.upload(owner, freshRequest, "test.png", "image", "image/png", bytes).fileId)
        cleanup.tick()
        org.mockito.Mockito.verify(platformFiles, org.mockito.Mockito.times(1)).deleteUnused(file)
        jdbc.update("UPDATE uploaded_files SET cleanup_retry_at=clock_timestamp()-interval '1 minute' WHERE id=?", file)
        cleanup.tick()
        org.mockito.Mockito.verify(platformFiles, org.mockito.Mockito.times(2)).deleteUnused(file)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM uploaded_files WHERE id=? AND cleanup_completed_at IS NOT NULL AND cleanup_error IS NULL", Int::class.java, file))
    }

    @Test
    fun cleanupSkipsAnOwnerBeingEditedThenObservesTheCommittedReference() {
        val initial = draft()
        val owner = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id))
        val file = registeredFile(owner)
        ageUnused(file)
        val locked = java.util.concurrent.CountDownLatch(1)
        val release = java.util.concurrent.CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val saving = executor.submit {
                org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult {
                    jdbc.queryForObject("SELECT id FROM members WHERE id=? FOR UPDATE", UUID::class.java, owner)
                    locked.countDown()
                    check(release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                    save(initial, initial.document.copy(profile = initial.document.profile.copy(imageId = file)))
                }
            }
            assertTrue(locked.await(10, java.util.concurrent.TimeUnit.SECONDS))
            cleanup.tick()
            org.mockito.Mockito.verifyNoInteractions(platformFiles)
            release.countDown()
            saving.get(10, java.util.concurrent.TimeUnit.SECONDS)
            cleanup.tick()
            org.mockito.Mockito.verifyNoInteractions(platformFiles)
            assertEquals(file, draft().document.profile.imageId)
        } finally {
            release.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun unusedFileReviewIsReadOnlyAndProtectsDraftPublishedAndSharedImages() {
        val initial = draft()
        draft("admin")
        val owner = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, initial.id)
        val adminId = jdbc.queryForObject("SELECT id FROM members WHERE subject='admin'", UUID::class.java)
        val ids = List(4) { UUID.randomUUID() }
        for ((index, id) in ids.withIndex()) {
            jdbc.update("INSERT INTO uploaded_files(id,member_id,original_name,media_type,size) VALUES (?,?,?,'image/png',1000)",
                id, if (index == 3) adminId else owner, "fixture-$index.png")
        }
        val public = save(initial, initial.document.copy(profile = initial.document.profile.copy(name = "작성자", imageId = ids[0])))
        publish(public)
        save(draft(), public.document.copy(profile = public.document.profile.copy(imageId = ids[1])))
        val previous = siteSettings.configuration()
        try {
            val input = kr.shnea.status.admin.SystemSettings(kr.shnea.status.admin.AiLimits(), previous.copy(shareImageId = ids[3]))
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(input))).andExpect(status().isOk)
            mvc.perform(get("/api/admin/files/review")).andExpect(status().isUnauthorized)
            mvc.perform(get("/api/admin/files/review").with(login())).andExpect(status().isForbidden)
            mvc.perform(get("/api/admin/files/review").with(login("admin")))
                .andExpect(status().isOk).andExpect(jsonPath("$.inspected").value(4))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].id").value(ids[2].toString()))
                .andExpect(jsonPath("$.items[0].ownerName").value(jdbc.queryForObject("SELECT display_name FROM members WHERE id=?", String::class.java, owner)))
            assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM uploaded_files", Int::class.java))
            assertEquals(ids[1], draft().document.profile.imageId)
        } finally {
            jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='site'", json.writeValueAsString(previous))
        }
    }

    @Test
    fun siteSettingsProtectShareImagesAndEnforceUploadLimitsWithoutPublishingPrivateConfiguration() {
        draft("admin")
        val owner = draft()
        val adminId = jdbc.queryForObject("SELECT id FROM members WHERE subject='admin'", UUID::class.java)
        val ownerId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, owner.id)
        val adminFile = UUID.randomUUID()
        val privateFile = UUID.randomUUID()
        for ((id, memberId) in listOf(adminFile to adminId, privateFile to ownerId)) {
            jdbc.update("INSERT INTO uploaded_files(id,member_id,original_name,media_type,size) VALUES (?,?,?,'image/png',1024)",
                id, memberId, "share.png")
        }
        val previous = siteSettings.configuration()
        val input = kr.shnea.status.admin.SystemSettings(kr.shnea.status.admin.AiLimits(),
            kr.shnea.status.config.SiteConfiguration(serviceName = "상태창 테스트", announcement = "<strong>점검 안내</strong>",
                announcementEnabled = true, shareImageId = adminFile, imageMaxMiB = 1, attachmentMaxMiB = 2))
        try {
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(input))).andExpect(status().isOk)
            mvc.perform(get("/api/public/site")).andExpect(status().isOk)
                .andExpect(jsonPath("$.serviceName").value("상태창 테스트"))
                .andExpect(jsonPath("$.announcement").value("<strong>점검 안내</strong>"))
                .andExpect(jsonPath("$.shareImageUrl").value("/api/public/site/files/$adminFile/content/preview"))
                .andExpect(jsonPath("$.aiLimits").doesNotExist()).andExpect(jsonPath("$.shareImageId").doesNotExist())
            siteSettings.requireShareImage(adminFile)
            mvc.perform(get("/api/public/site/files/$privateFile/content/preview")).andExpect(status().isNotFound)
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(input.copy(site = input.site!!.copy(shareImageId = privateFile)))))
                .andExpect(status().isBadRequest)
            assertEquals(adminFile, siteSettings.configuration().shareImageId)
            val largeImage = ByteArray(1024 * 1024 + 1)
            byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10).copyInto(largeImage)
            mvc.perform(multipart("/api/files").file(MockMultipartFile("file", "large.png", "image/png", largeImage))
                .param("requestId", UUID.randomUUID().toString()).param("kind", "image").with(login()).with(csrf()))
                .andExpect(status().isBadRequest).andExpect(jsonPath("$.message").value("파일은 1MiB 이하로 등록해주세요."))
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(input.copy(site = input.site.copy(imageMaxMiB = 11)))))
                .andExpect(status().isBadRequest)
            assertEquals(1, siteSettings.configuration().imageMaxMiB)
            mvc.perform(put("/api/admin/settings").with(login("admin")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(input.copy(site = input.site.copy(shareImageId = null, announcementEnabled = false)))))
                .andExpect(status().isOk)
            mvc.perform(get("/api/public/site/files/$adminFile/content/preview")).andExpect(status().isNotFound)
            mvc.perform(get("/api/public/site")).andExpect(jsonPath("$.announcement").value(""))
                .andExpect(jsonPath("$.shareImageUrl").value("/share-default.png"))
            assertTrue(jdbc.queryForObject("SELECT count(*) FROM admin_audit WHERE action='site-settings' AND actor_id=?",
                Int::class.java, adminId)!! > 0)
        } finally {
            jdbc.update("UPDATE system_settings SET value=?::jsonb WHERE key='site'", json.writeValueAsString(previous))
        }
    }

    @Test
    fun visitsDeduplicateEventsAndExcludeOwnerBotsAndPrivatePages() {
        val initial = draft()
        val saved = save(initial, initial.document.copy(profile = initial.document.profile.copy(name = "작성자")))
        publish(saved)
        publish(saved)
        fun visitor(): Pair<jakarta.servlet.http.Cookie, String> {
            val result = mvc.perform(get("/api/session")).andExpect(status().isOk).andReturn()
            return Pair(org.springframework.mock.web.MockCookie.parse(requireNotNull(result.response.getHeader("Set-Cookie")) { "Session cookie missing; headers=" + result.response.headerNames + "; session=" + result.request.getSession(false)?.javaClass?.simpleName }),
                json.readTree(result.response.contentAsString).get("csrfToken").asString())
        }
        val session = visitor()
        val event = UUID.randomUUID()
        fun visit(eventId: UUID, current: Pair<jakarta.servlet.http.Cookie, String> = session, agent: String = "Mozilla/5.0") =
            mvc.perform(post("/api/public/portfolios/${saved.slug}/visit").cookie(current.first)
                .header("X-CSRF-TOKEN", current.second).header("User-Agent", agent).contentType("application/json")
                .content("""{"eventId":"$eventId"}"""))
        visit(event).andExpect(status().isNoContent)
        visit(event).andExpect(status().isNoContent)
        visit(UUID.randomUUID()).andExpect(status().isNoContent)
        visit(UUID.randomUUID(), visitor()).andExpect(status().isNoContent)
        visit(UUID.randomUUID(), agent = "Googlebot").andExpect(status().isNoContent)
        mvc.perform(post("/api/public/portfolios/${saved.slug}/visit").cookie(session.first).with(login()).with(csrf())
            .contentType("application/json").content("""{"eventId":"${UUID.randomUUID()}"}""")).andExpect(status().isNoContent)
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM visits", Int::class.java))
        val ownerId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, saved.id)
        mvc.perform(get("/api/admin/statistics").param("days", "7").param("memberId", ownerId.toString()).with(login("admin")))
            .andExpect(status().isOk).andExpect(jsonPath("$.daily.length()").value(7))
            .andExpect(jsonPath("$.daily[6].views").value(3)).andExpect(jsonPath("$.daily[6].sessions").value(2))
            .andExpect(jsonPath("$.daily[6].publications").value(1))
        val other = draft("other")
        val otherId = jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, other.id)
        mvc.perform(get("/api/admin/statistics").param("days", "7").param("memberId", otherId.toString()).with(login("admin")))
            .andExpect(jsonPath("$.daily[6].views").value(0))
        mvc.perform(get("/api/admin/statistics").param("days", "1").with(login("admin"))).andExpect(status().isBadRequest)
        mvc.perform(get("/api/admin/statistics").with(login())).andExpect(status().isForbidden)
        mvc.perform(post("/api/portfolio/unpublish").with(login()).with(csrf())).andExpect(status().isOk)
        visit(UUID.randomUUID()).andExpect(status().isNotFound)
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM visits", Int::class.java))
        assertTrue(jdbc.queryForList("SELECT visitor_hash FROM visits", String::class.java)
            .all { requireNotNull(it).matches(Regex("[0-9a-f]{64}")) && it != session.first.value })
    }

    @Test
    fun sitemapContainsOnlyCurrentPublicPagesAndCanonicalAddresses() {
        val initial = draft()
        val visible = Project(id = UUID.randomUUID(), title = "공개 프로젝트")
        val hidden = Project(id = UUID.randomUUID(), title = "숨긴 프로젝트", visible = false)
        val saved = save(initial, initial.document.copy(projects = listOf(visible, hidden)))
        draft("other")
        publish(saved)
        mvc.perform(get("/api/public/sitemap")).andExpect(status().isOk)
            .andExpect(jsonPath("$.pages").value(1)).andExpect(jsonPath("$.entries.length()").value(2))
            .andExpect(jsonPath("$.entries[0].path").value("/@${saved.slug}"))
            .andExpect(jsonPath("$.entries[1].path").value("/@${saved.slug}/projects/${visible.id}"))
        val unpublishedEdit = save(saved, saved.document.copy(projects = listOf(visible.copy(visible = false), hidden)))
        mvc.perform(get("/api/public/sitemap")).andExpect(jsonPath("$.entries.length()").value(2))
        publish(unpublishedEdit)
        mvc.perform(get("/api/public/sitemap")).andExpect(jsonPath("$.entries.length()").value(1))
        mvc.perform(put("/api/portfolio/slug").with(login()).with(csrf()).contentType("application/json")
            .content("""{"slug":"new-canonical"}""")).andExpect(status().isConflict)
        mvc.perform(get("/api/public/sitemap")).andExpect(jsonPath("$.entries[0].path").value("/@${saved.slug}"))
        mvc.perform(post("/api/portfolio/unpublish").with(login()).with(csrf())).andExpect(status().isOk)
        mvc.perform(get("/api/public/sitemap")).andExpect(jsonPath("$.pages").value(0)).andExpect(jsonPath("$.entries.length()").value(0))
    }

    @Autowired lateinit var pdfJobs: kr.shnea.status.pdf.PdfJobs

    @Test
    fun pdfJobsFreezeSelectedVersionFilterPrivateDataAndRequireTheirScopedCredential() {
        val initial = draft()
        val project = Project(id = UUID.randomUUID(), title = "공개 프로젝트", content = json.readTree("""{"format":"shnea-editor","version":3,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"프로젝트 본문"}]}]}}"""))
        val saved = save(initial, initial.document.copy(projects = listOf(project, Project(title = "숨긴 프로젝트", visible = false))))
        publish(saved)
        val updated = save(saved, saved.document.copy(profile = saved.document.profile.copy(name = "새 초안")))
        val ownerId = requireNotNull(jdbc.queryForObject("SELECT member_id FROM portfolios WHERE id=?", UUID::class.java, saved.id))
        val draftJob = pdfJobs.create(ownerId, kr.shnea.status.pdf.ExportPdf("draft", updated.revision, true))
        val publicJob = pdfJobs.create(ownerId, kr.shnea.status.pdf.ExportPdf("published", saved.revision))
        try {
            assertEquals("새 초안", draftJob.view.document.profile.name)
            assertEquals(saved.document.profile.name, publicJob.view.document.profile.name)
            assertEquals(1, draftJob.view.document.projects.size)
            assertTrue(draftJob.view.document.projects[0].content?.isObject == true)
            assertEquals(null, publicJob.view.document.projects[0].content)
            assertEquals(setOf(project.id), draftJob.view.publicProjectIds)
            mvc.perform(get("/api/pdf/render/${draftJob.id}")).andExpect(status().isNotFound)
            mvc.perform(get("/api/pdf/render/${draftJob.id}").with(login("other"))).andExpect(status().isNotFound)
            mvc.perform(get("/api/pdf/render/${draftJob.id}").header("Authorization", "Bearer invalid")).andExpect(status().isNotFound)
            mvc.perform(get("/api/pdf/render/${draftJob.id}").header("Authorization", "Bearer ${draftJob.token}"))
                .andExpect(status().isOk).andExpect(jsonPath("$.document.profile.name").value("새 초안"))
            mvc.perform(get("/api/pdf/render/${draftJob.id}/files/${UUID.randomUUID()}/content/preview")
                .header("Authorization", "Bearer ${draftJob.token}")).andExpect(status().isNotFound)
            val stale = kotlin.test.assertFailsWith<org.springframework.web.server.ResponseStatusException> {
                pdfJobs.create(ownerId, kr.shnea.status.pdf.ExportPdf("draft", saved.revision))
            }
            assertEquals(409, stale.statusCode.value())
            jdbc.update("UPDATE members SET suspended=true WHERE id=?", ownerId)
            mvc.perform(get("/api/pdf/render/${draftJob.id}").header("Authorization", "Bearer ${draftJob.token}")).andExpect(status().isNotFound)
        } finally { pdfJobs.remove(draftJob.id); pdfJobs.remove(publicJob.id) }
        mvc.perform(get("/api/pdf/render/${draftJob.id}").header("Authorization", "Bearer ${draftJob.token}")).andExpect(status().isNotFound)
    }

    @Test
    fun firstUserIsNotAdminAndMutationsRequireCsrf() {
        draft()
        mvc.perform(get("/api/admin/overview").with(login())).andExpect(status().isForbidden)
        mvc.perform(get("/api/session").with(login())).andExpect(jsonPath("$.admin").value(false))
        mvc.perform(post("/api/portfolio/unpublish").with(login())).andExpect(status().isForbidden)
        mvc.perform(get("/api/portfolio")).andExpect(status().isUnauthorized)
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM icon_catalog", Long::class.java)!! > 3000)
    }
}

@TestConfiguration
class TestOidcConfiguration {
    @Bean
    fun registrations(): ClientRegistrationRepository {
        val registration = ClientRegistration.withRegistrationId("platform").clientId("app")
            .clientAuthenticationMethod(ClientAuthenticationMethod.NONE).authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("http://localhost:30165/callback").scope("openid", "profile", "email")
            .authorizationUri("https://issuer.example.test/auth").tokenUri("https://issuer.example.test/token")
            .jwkSetUri("https://issuer.example.test/certs").issuerUri("https://issuer.example.test")
            .userInfoUri("https://issuer.example.test/userinfo").userNameAttributeName("sub").build()
        return InMemoryClientRegistrationRepository(registration)
    }
}

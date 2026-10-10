package kr.shnea.status.portfolio

import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

data class IconRef(val provider: String = "initials", val key: String = "", val hex: String = "", val monochromeAllowed: Boolean = false)
data class Contact(val id: UUID = UUID.randomUUID(), val type: String = "web", val label: String = "", val value: String = "", val icon: String = "link", val visible: Boolean = true)
data class Profile(
    val name: String = "",
    val title: String = "",
    val introduction: String = "",
    val imageId: UUID? = null,
    val bannerImageId: UUID? = null,
    val contacts: List<Contact> = emptyList(),
    val about: JsonNode? = null
)
data class SelectedSkill(val id: UUID, val name: String = "", val category: String = "", val icon: IconRef = IconRef(), val featured: Boolean = false)
data class Project(val id: UUID = UUID.randomUUID(), val title: String = "", val role: String = "", val summary: String = "", val imageId: UUID? = null, val skillIds: List<UUID> = emptyList(), val links: List<Contact> = emptyList(), val content: JsonNode? = null, val visible: Boolean = true)
data class History(val id: UUID = UUID.randomUUID(), val title: String = "", val organization: String = "", val role: String = "", val summary: String = "", val startMonth: String = "", val endMonth: String = "", val ongoing: Boolean = false, val content: JsonNode? = null, val visible: Boolean = true)
data class Certification(val id: UUID = UUID.randomUUID(), val name: String = "", val issuer: String = "", val issuedOn: String = "", val expiresOn: String = "", val credentialId: String = "", val credentialIdVisible: Boolean = false, val url: String = "", val visible: Boolean = true)
data class SectionSetting(val id: String, val visible: Boolean = true)
data class PortfolioDocument(
    val profile: Profile = Profile(),
    val skills: List<SelectedSkill> = emptyList(),
    val projects: List<Project> = emptyList(),
    val history: List<History> = emptyList(),
    val certifications: List<Certification> = emptyList(),
    val sections: List<SectionSetting> = listOf(SectionSetting("skills"), SectionSetting("projects"), SectionSetting("about"), SectionSetting("history"), SectionSetting("certifications")),
    val template: String = "swiss"
) {
    fun withAboutSection(): PortfolioDocument {
        if (sections.any { it.id == "about" }) return this
        // Preserve the former placement when reading existing four-section snapshots.
        val projectIndex = sections.indexOfFirst { it.id == "projects" && it.visible && projects.any { project -> project.visible } }
        val ordered = sections.toMutableList()
        ordered.add(projectIndex + 1, SectionSetting("about"))
        return copy(sections = ordered)
    }

    fun publicProjection(): PortfolioDocument {
        val document = withAboutSection()
        val visibleSections = document.sections.filter { it.visible }.map { it.id }.toSet()
        return document.copy(
            profile = profile.copy(about = if ("about" in visibleSections) profile.about else null, contacts = profile.contacts.filter { it.visible }, bannerImageId = if (template == "swiss") null else profile.bannerImageId),
            skills = if ("skills" in visibleSections) skills else emptyList(),
            projects = if ("projects" in visibleSections) projects.filter { it.visible }.map { it.copy(links = it.links.filter { link -> link.visible }) } else emptyList(),
            history = if ("history" in visibleSections) history.filter { it.visible } else emptyList(),
            certifications = if ("certifications" in visibleSections) certifications.filter { it.visible }.map { it.copy(credentialId = if (it.credentialIdVisible) it.credentialId else "") } else emptyList()
        )
    }
}

data class PortfolioRecord(val id: UUID, val memberId: UUID, val slug: String, val draft: PortfolioDocument, val revision: Long, val published: PortfolioDocument?, val publishedRevision: Long?, val isPublic: Boolean, val aiConsent: Boolean, val updatedAt: Instant)
data class DraftView(val id: UUID, val slug: String, val document: PortfolioDocument, val revision: Long, val publishedRevision: Long?, val isPublic: Boolean, val aiConsent: Boolean, val updatedAt: Instant)
data class SaveDraft(val revision: Long, val document: PortfolioDocument)
data class PublishDraft(val revision: Long)
data class ChangeSlug(val slug: String)
data class AiConsent(val enabled: Boolean)
data class PublicPortfolio(val id: UUID, val slug: String, val document: PortfolioDocument, val revision: Long, val aiEnabled: Boolean, val canonicalSlug: String)

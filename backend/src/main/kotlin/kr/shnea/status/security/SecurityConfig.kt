package kr.shnea.status.security

import kr.shnea.status.account.Accounts
import kr.shnea.status.account.SessionView
import kr.shnea.status.config.AppSettings
import kr.shnea.status.config.ApiError
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.security.web.csrf.CsrfException
import tools.jackson.databind.json.JsonMapper
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.session.jdbc.PostgreSqlJdbcIndexedSessionRepositoryCustomizer

@Configuration
class SecurityConfig(
    private val accounts: Accounts,
    private val settings: AppSettings,
    private val registrations: ClientRegistrationRepository,
    private val json: JsonMapper
) {
    @Bean
    fun sessionRepositoryCustomizer() = PostgreSqlJdbcIndexedSessionRepositoryCustomizer()

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        val logoutHandler = OidcClientInitiatedLogoutSuccessHandler(registrations)
        logoutHandler.setPostLogoutRedirectUri(settings.logoutRedirectUri)
        http.authorizeHttpRequests { rules ->
            rules.requestMatchers("/api/session", "/api/public/**", "/api/pdf/render/**", "/api/catalog/icons", "/actuator/health", "/oauth2/**", "/callback").permitAll()
            rules.anyRequest().authenticated()
        }
        http.csrf { csrf ->
            csrf.csrfTokenRepository(HttpSessionCsrfTokenRepository())
            csrf.csrfTokenRequestHandler(CsrfTokenRequestAttributeHandler())
        }
        http.exceptionHandling { errors ->
            errors.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            errors.accessDeniedHandler { _, response, failure ->
                val error = if (failure is CsrfException) {
                    ApiError("로그인 정보가 갱신되었습니다. 같은 계정인지 확인한 뒤 다시 시도해주세요.", "CSRF_TOKEN_INVALID")
                } else {
                    ApiError("이 요청을 실행할 권한이 없습니다.", "ACCESS_DENIED")
                }
                response.status = HttpStatus.FORBIDDEN.value()
                response.contentType = "application/json"
                response.outputStream.write(json.writeValueAsBytes(error))
            }
        }
        http.addFilterBefore(object : OncePerRequestFilter() {
            override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
                val authentication = SecurityContextHolder.getContext().authentication
                if (request.method == "GET" && request.requestURI.removePrefix(request.contextPath) == "/oauth2/authorization/platform"
                    && authentication?.isAuthenticated == true && authentication.principal is OidcUser) {
                    response.sendRedirect(settings.publicUrl + "/dashboard")
                    return
                }
                chain.doFilter(request, response)
            }
        }, OAuth2AuthorizationRequestRedirectFilter::class.java)
        http.oauth2Login { login ->
            login.redirectionEndpoint { endpoint -> endpoint.baseUri("/callback") }
            login.successHandler { request, response, authentication ->
                val user = authentication.principal as OidcUser
                accounts.provision(user)
                response.sendRedirect(settings.publicUrl + "/dashboard")
            }
            login.failureHandler { _, response, _ -> response.sendRedirect(settings.publicUrl + "/login?error=oidc") }
        }
        http.logout { logout -> logout.logoutSuccessHandler(logoutHandler).invalidateHttpSession(true).deleteCookies("STATUS_SESSION") }
        return http.build()
    }
}

@RestController
class SessionController(private val accounts: Accounts) {
    @GetMapping("/api/session")
    fun session(authentication: Authentication?, csrfToken: CsrfToken): SessionView {
        val member = accounts.current(authentication)
        return SessionView(member, accounts.isAdmin(member), csrfToken.token)
    }
}

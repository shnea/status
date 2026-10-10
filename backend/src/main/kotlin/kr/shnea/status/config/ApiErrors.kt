package kr.shnea.status.config

import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

data class ApiError(val message: String, val code: String? = null)

class CodedApiFailure(status: HttpStatus, message: String, val code: String) : ResponseStatusException(status, message)

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException::class)
    fun status(error: ResponseStatusException): ResponseEntity<ApiError> {
        return ResponseEntity.status(error.statusCode).body(ApiError(error.reason ?: "요청을 처리할 수 없습니다.", (error as? CodedApiFailure)?.code))
    }

    @ExceptionHandler(IllegalArgumentException::class)
    fun validation(error: IllegalArgumentException): ResponseEntity<ApiError> {
        return ResponseEntity.badRequest().body(ApiError(error.message ?: "입력값을 확인해주세요."))
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun duplicate(): ResponseEntity<ApiError> {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError("이미 사용 중인 값입니다."))
    }
}

package kr.shnea.status

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class StatusApplication

fun main(args: Array<String>) {
    runApplication<StatusApplication>(*args)
}

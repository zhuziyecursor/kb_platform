package com.kb.publicapi;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class PublicApiArchTest {

    private static JavaClasses importedClasses;

    @BeforeAll
    static void setUp() {
        importedClasses = new ClassFileImporter()
                .importPackages("com.kb.publicapi");
    }

    @Test
    void noJpaDependency() {
        noClasses()
                .should().dependOnClassesThat()
                .resideInAnyPackage("jakarta.persistence..", "org.hibernate..")
                .check(importedClasses);
    }

    @Test
    void noKafkaDependency() {
        noClasses()
                .should().dependOnClassesThat()
                .resideInAPackage("org.springframework.kafka..")
                .check(importedClasses);
    }

    @Test
    void noMinioSdkDependency() {
        noClasses()
                .should().dependOnClassesThat()
                .resideInAPackage("io.minio..")
                .check(importedClasses);
    }
}

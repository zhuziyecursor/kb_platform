package com.kb.rag;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class RagServiceArchTest {

    private static JavaClasses importedClasses;

    @BeforeAll
    static void setUp() {
        importedClasses = new ClassFileImporter()
                .importPackages("com.kb.rag");
    }

    @Test
    void noExternalRepositoryShouldHaveWriteMethods() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..repository..")
                .and().haveNameNotMatching(".*(RagSession|RagMessage)Repository")
                .should().dependOnClassesThat()
                .haveSimpleName("Modifying");

        rule.check(importedClasses);
    }
}

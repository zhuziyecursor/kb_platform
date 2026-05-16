package com.kb.rag;

import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class RagServiceArchTest {

    private static final String QUERY_ANNOTATION = "org.springframework.data.jpa.repository.Query";
    private static final String PARAM_ANNOTATION = "org.springframework.data.repository.query.Param";
    private static final Set<String> TENANT_PARAM_NAMES = Set.of("tenantId", "tid", "tenant_id");

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

    /**
     * Every {@code @Query} method that drives a retrieval channel against
     * kb_knowledge data MUST bind {@code @Param("tenantId")}. Prevents an
     * accidental cross-tenant query slipping through Sparse / Structured /
     * Doc / Space / Acl / Version repositories.
     *
     * <p>Session/Message/Audit repositories are scoped via sessionId or
     * messageId — those are tenant-internal IDs not used for retrieval —
     * so they are intentionally excluded.</p>
     */
    @Test
    void retrievalRepositoryQueriesMustCarryTenantId() {
        ArchRule rule = methods()
                .that().areAnnotatedWith(QUERY_ANNOTATION)
                .and().areDeclaredInClassesThat()
                .haveNameMatching(".*\\.(SearchIndex|KnowledgeStructured|KnowledgeDoc|KnowledgeVersion|KnowledgeSpace|DocAcl)Repository")
                .should(bindParamNamedAnyOf(TENANT_PARAM_NAMES));
        rule.check(importedClasses);
    }

    private static ArchCondition<JavaMethod> bindParamNamedAnyOf(Set<String> allowed) {
        return new ArchCondition<>("bind a @Param matching one of " + allowed) {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                boolean ok = false;
                for (JavaParameter p : method.getParameters()) {
                    for (JavaAnnotation<?> ann : p.getAnnotations()) {
                        if (!PARAM_ANNOTATION.equals(ann.getRawType().getName())) {
                            continue;
                        }
                        Object value = ann.getProperties().get("value");
                        if (value instanceof String s && allowed.contains(s)) {
                            ok = true;
                            break;
                        }
                    }
                    if (ok) break;
                }
                if (!ok) {
                    events.add(SimpleConditionEvent.violated(method,
                            "method " + method.getFullName()
                                    + " has no @Param(\"tenantId\") — cross-tenant query risk"));
                }
            }
        };
    }
}

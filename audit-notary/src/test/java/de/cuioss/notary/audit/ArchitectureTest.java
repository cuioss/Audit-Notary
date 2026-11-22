/*
 * Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package de.cuioss.notary.audit;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@DisplayName("The layering of doc/specification/architecture-and-modules.adoc (AUN-GEN-2, AUN-GEN-4)")
class ArchitectureTest {

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("de.cuioss.notary.audit");
    }

    @Test
    @DisplayName("no application package imports JGit")
    void noJgit() {
        noClasses().should().dependOnClassesThat().resideInAPackage("org.eclipse.jgit..").check(classes);
    }

    @Test
    @DisplayName("only the service package uses the git-document-repository libraries")
    void onlyServiceUsesLibraries() {
        noClasses().that().resideOutsideOfPackage("de.cuioss.notary.audit.service..").should().dependOnClassesThat()
                .resideInAPackage("de.cuioss.git.document..").check(classes);
    }

    @Test
    @DisplayName("web and mcp do not depend on each other")
    void webAndMcpIndependent() {
        noClasses().that().resideInAPackage("de.cuioss.notary.audit.web..").should().dependOnClassesThat()
                .resideInAPackage("de.cuioss.notary.audit.mcp..").allowEmptyShould(true).check(classes);
        noClasses().that().resideInAPackage("de.cuioss.notary.audit.mcp..").should().dependOnClassesThat()
                .resideInAPackage("de.cuioss.notary.audit.web..").allowEmptyShould(true).check(classes);
    }

    @Test
    @DisplayName("security depends on config only; service on config only; config on no other package")
    void layers() {
        noClasses().that().resideInAPackage("de.cuioss.notary.audit.security..").should().dependOnClassesThat()
                .resideInAnyPackage("de.cuioss.notary.audit.web..", "de.cuioss.notary.audit.service..",
                        "de.cuioss.notary.audit.mcp..")
                .check(classes);
        noClasses().that().resideInAPackage("de.cuioss.notary.audit.service..").should().dependOnClassesThat()
                .resideInAnyPackage("de.cuioss.notary.audit.web..", "de.cuioss.notary.audit.security..",
                        "de.cuioss.notary.audit.mcp..")
                .check(classes);
        noClasses().that().resideInAPackage("de.cuioss.notary.audit.config..").should().dependOnClassesThat()
                .resideInAnyPackage("de.cuioss.notary.audit.web..", "de.cuioss.notary.audit.service..",
                        "de.cuioss.notary.audit.security..", "de.cuioss.notary.audit.mcp..")
                .check(classes);
    }
}

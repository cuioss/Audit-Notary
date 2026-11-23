/*
 * Copyright © 2026-present Oliver Wolff
 *
 * SPDX-License-Identifier: FSL-1.1-ALv2
 *
 * Licensed under the Functional Source License, Version 1.1, ALv2 Future License
 * (the "License"); you may not use this file except in compliance with the License.
 * The License is in the file LICENSE.md at the root of this repository and at
 * https://github.com/cuioss/Audit-Notary/blob/main/LICENSE.md.
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

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
package de.cuioss.notary.audit.mock.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import de.cuioss.notary.audit.mock.WebMockLogMessages;
import de.cuioss.notary.audit.mock.scenario.Handler;
import de.cuioss.notary.audit.mock.scenario.Link;
import de.cuioss.notary.audit.mock.scenario.Requirement;
import de.cuioss.notary.audit.mock.scenario.Route;
import de.cuioss.notary.audit.mock.scenario.Scenario;
import de.cuioss.notary.audit.mock.scenario.ScenarioReference;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import de.cuioss.notary.audit.mock.scenario.ScenarioState;
import de.cuioss.notary.audit.mock.scenario.ScenarioValidationException;
import de.cuioss.tools.logging.CuiLogger;
import org.jspecify.annotations.Nullable;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

/**
 * The engine of the web mock: answers the requests of the web app from the active scenario and emulates what the
 * browser sees of the real application (doc/specification/testing.adoc, AUN-TEST-1).
 * <p>
 * Order of handling: the control routes under {@code /mock/}; the form login {@code /j_security_check}; the public
 * requests (status, messages, login, callback); the session check; the anti-CSRF and {@code Origin} check of
 * state-changing requests; the first-login restriction; the refusal of a session without a right outside the shell;
 * the built-in session, logout and event stream; the links of the current state; the routes of the state, then of
 * the scenario (a route may name a built-in handler instead of a body, {@link Handler}); otherwise
 * {@code 404 MOCK_NO_ROUTE}.
 */
public final class MockEngine implements AutoCloseable {

    /** The cookie of the emulated session. Not {@code Secure}: the mock runs on plain HTTP behind the Vite proxy. */
    public static final String SESSION_COOKIE = "audit-notary-mock-session";

    /** The header of the anti-CSRF token. */
    public static final String CSRF_HEADER = "X-CSRF-Token";

    /** The prefix of every request of the web app. */
    private static final String API = "/api/v1/";

    /** The login address the {@code 401} answer names with the identity provider. */
    public static final String LOGIN_PATH = API + "auth/login";

    /** The callback of the identity provider, answered only when the scenario defines a route for it. */
    public static final String CALLBACK_PATH = API + "auth/callback";

    /** The login address the {@code 401} answer names, and the page of the login, with local users. */
    public static final String LOCAL_LOGIN_PAGE = "/login";

    /** The form login of local users; no {@code /api/v1} request (doc/specification/rest-api.adoc). */
    public static final String SECURITY_CHECK_PATH = "/j_security_check";

    /** The page of the web app the emulated logout leads to. */
    public static final String SIGNED_OUT_PATH = "/signed-out";

    private static final CuiLogger LOGGER = new CuiLogger(MockEngine.class);

    private static final String MOCK = "/mock/";
    private static final String GET = "GET";
    private static final String POST = "POST";
    private static final String OUTCOME = "outcome";
    private static final String STATUS_ROUTE = GET + " " + API + "status";
    private static final String LOGIN_ROUTE = GET + " " + LOGIN_PATH;
    private static final String CALLBACK_ROUTE = GET + " " + CALLBACK_PATH;
    private static final String LOGIN_PROBLEM = "/login-problem?reason=";
    private static final String TOO_MANY_LOGINS = "TOO_MANY_LOGINS";
    private static final String LOCATION = "Location";

    /**
     * The most bytes of a request body the adapter buffers. A source of the AsciiDoc preview (at most 65,536 bytes
     * of UTF-8) escaped in JSON needs at most six times that (six bytes for a control character), so the cap is far
     * above any body the mock answers.
     */
    public static final int MAX_BODY_BYTES = 1_048_576;

    private static final String SET_COOKIE = "Set-Cookie";
    private static final String FORM = "application/x-www-form-urlencoded";

    /** What a browser navigation is told, instead of the JSON, when the login start or the callback is refused. */
    private static final Map<String, String> LOGIN_PROBLEMS = Map.of("IDENTITY_PROVIDER_UNAVAILABLE",
            "idp-unavailable", TOO_MANY_LOGINS, "too-many-logins", "UNKNOWN_TRANSACTION", "unknown-transaction");
    private static final String SCENARIO_FIELD = "scenario";
    private static final String EVENTS_PATH = API + "events";
    private static final int ORDERED_DEPTH_LIMIT = 64;
    /** A request about one document: {@code /api/v1/(documents|drafts|releases)/{repository}/{id}[/...]}. */
    private static final Pattern DOCUMENT_REQUEST = Pattern
            .compile("^/api/v1/(?:documents|drafts|releases)/([^/]+)/[^/]+(?:/|$)");
    /** When the catalog entry handler says an entry was saved, and when retired (the mock's "now" is 2026-11-26). */
    private static final String CATALOG_SAVED_AT = "2026-11-26T09:30:00Z";
    private static final String CATALOG_RETIRED_AT = "2026-11-26T09:35:00Z";
    private static final int SEARCH_MIN = 2;
    private static final int SEARCH_MAX = 200;
    private static final int SEARCH_LIMIT = 20;

    /** The requests answered during the first login (doc/specification/directory.adoc, AUN-DIR-2). */
    private static final Set<String> FIRST_LOGIN_ALLOWED = Set.of("GET /api/v1/directory/me",
            "PUT /api/v1/directory/me", "GET /api/v1/catalogs/team", "GET /api/v1/catalogs/role",
            "GET /api/v1/session", "GET /api/v1/messages", STATUS_ROUTE, "POST /api/v1/auth/logout",
            "GET " + EVENTS_PATH, LOGIN_ROUTE);

    /** The requests a session without a right still makes: the shell and the first login. */
    private static final Set<String> SHELL = Set.of("GET /api/v1/status", "GET /api/v1/messages",
            "GET /api/v1/session", "GET /api/v1/due", "GET " + EVENTS_PATH, "POST /api/v1/auth/logout",
            "GET /api/v1/directory/me", "PUT /api/v1/directory/me", "POST /api/v1/directory/me/confirmation",
            "GET /api/v1/catalogs/team", "GET /api/v1/catalogs/role", LOGIN_ROUTE, CALLBACK_ROUTE);

    private final ObjectMapper mapper;
    private final ScenarioRegistry registry;
    private final CanonicalAddresses addresses;
    private final MessageCatalogue catalogue;
    private final Timing timing;
    private final EventBroadcaster broadcaster;
    private final ScheduledExecutorService scheduler;
    private final SecureRandom random = new SecureRandom();
    private final ReentrantLock lock = new ReentrantLock();
    private final Map<String, MockSession> sessions = new ConcurrentHashMap<>();
    private final List<Act> acts = new ArrayList<>();

    private Scenario scenario;
    private ScenarioState state;
    private long generation;

    /**
     * Creates an engine in the state of the initial reference.
     *
     * @param initial   the scenario and state to start in
     * @param timing    how delays are played
     * @param mapper    the JSON mapper
     * @param registry  the registry that resolves control requests
     * @param addresses the canonical addresses for the login's {@code return} check
     * @param catalogue the message catalogue
     */
    public MockEngine(ScenarioReference initial, Timing timing, ObjectMapper mapper, ScenarioRegistry registry,
            CanonicalAddresses addresses, MessageCatalogue catalogue) {
        this.mapper = mapper;
        this.registry = registry;
        this.addresses = addresses;
        this.catalogue = catalogue;
        this.timing = timing;
        this.broadcaster = new EventBroadcaster(mapper);
        this.scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("web-mock-timer").factory());
        this.scenario = initial.scenario();
        this.state = scenario.state(initial.state()).orElseThrow();
        lock.lock();
        try {
            enter(state, 0);
        } finally {
            lock.unlock();
        }
    }

    /**
     * The broadcaster of the event stream.
     *
     * @return the broadcaster
     */
    public EventBroadcaster broadcaster() {
        return broadcaster;
    }

    /**
     * The active scenario and state.
     *
     * @return the reference {@code name#state}
     */
    public String current() {
        lock.lock();
        try {
            return scenario.name() + "#" + state.id();
        } finally {
            lock.unlock();
        }
    }

    /**
     * Answers a request.
     *
     * @param request the request
     * @return the answer; {@link MockResponse#eventStream()} tells the adapter to open the event stream
     */
    public MockResponse handle(MockRequest request) {
        String path = request.path();
        if (path.startsWith(MOCK)) {
            return control(request);
        }
        if (SECURITY_CHECK_PATH.equals(path)) {
            return securityCheck(request);
        }
        if (!path.startsWith(API)) {
            return noRoute(request);
        }
        String key = request.method() + " " + path;
        Optional<MockResponse> open = publicRequest(request, key);
        if (open.isPresent()) {
            return open.get();
        }
        lock.lock();
        try {
            // The session and the CSRF token are read under the lock: a transition (enter) that ends or replaces the
            // sessions cannot run between the check and the act.
            var session = request.cookie(SESSION_COOKIE).map(sessions::get);
            if (session.isEmpty()) {
                return json(401, object().put(OUTCOME, "UNAUTHENTICATED").put("login", loginAddress()));
            }
            if (request.isStateChanging() && !passesCsrf(request, session.get())) {
                return json(403, object().put(OUTCOME, "CSRF_REJECTED"));
            }
            if (request.isStateChanging()) {
                acts.add(new Act(request.method(), request.target(), state.id(), redacted(parseBody(request))));
            }
            if (scenario.firstLoginRequired(state) && !FIRST_LOGIN_ALLOWED.contains(key)) {
                return json(403, object().put(OUTCOME, "FIRST_LOGIN_REQUIRED"));
            }
            if (scenario.rights().isEmpty() && !scenario.firstLoginRequired(state) && !SHELL.contains(key)) {
                return json(403, object().put(OUTCOME, "FORBIDDEN"));
            }
            return builtIn(key, session.get()).orElseGet(() -> scenarioAnswer(request, key));
        } finally {
            lock.unlock();
        }
    }

    private Optional<MockResponse> publicRequest(MockRequest request, String key) {
        return switch (key) {
            case STATUS_ROUTE -> {
                lock.lock();
                try {
                    yield Optional.of(scenarioAnswer(request, key));
                } finally {
                    lock.unlock();
                }
            }
            case "GET /api/v1/messages" -> Optional.of(messages(request));
            case LOGIN_ROUTE -> Optional.of(login(request));
            case CALLBACK_ROUTE -> callback(request);
            default -> Optional.empty();
        };
    }

    private Optional<MockResponse> builtIn(String key, MockSession session) {
        return switch (key) {
            case "GET /api/v1/session" -> Optional.of(json(200, sessionBody(session)));
            case "POST /api/v1/auth/logout" -> {
                sessions.remove(session.id());
                yield Optional.of(json(200, object().put("redirect", SIGNED_OUT_PATH)).withHeader(SET_COOKIE,
                        SESSION_COOKIE + "=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/"));
            }
            case "GET " + EVENTS_PATH -> Optional.of(MockResponse.openEventStream());
            default -> Optional.empty();
        };
    }

    private MockResponse scenarioAnswer(MockRequest request, String key) {
        var query = request.queryParameters();
        Optional<Link> link = state.linkFor(request.method(), request.path(), query);
        if (link.isPresent()) {
            var taken = link.get();
            if (!permitted(taken.requires())) {
                return forbidden();
            }
            if (!taken.next().equals(state.id())) {
                enter(scenario.state(taken.next()).orElseThrow(), 0);
            }
            return answer(taken.status(), taken.body());
        }
        return scenario.match(state, request.method(), request.path(), query).map(match -> {
            var route = match.route();
            if (!permitted(route.requires())) {
                return forbidden();
            }
            return route.handler() == null ? answer(route.status(), route.body())
                    : handled(route.handler(), route, request, match.captures());
        }).orElseGet(() -> unrouted(request));
    }

    private MockResponse forbidden() {
        return json(403, object().put(OUTCOME, "FORBIDDEN"));
    }

    /** Whether the rights of the scenario hold what a route or a link requires; no requirement is always held. */
    private boolean permitted(@Nullable Requirement requires) {
        return requires == null || requires.heldBy(scenario.rights());
    }

    /**
     * The answer to a request no route or link answers: {@code 404 NOT_FOUND} for a document, draft or release of a
     * repository the scenario's rights name (an id the scenario does not know does not exist there,
     * doc/specification/rest-api.adoc), otherwise {@code 404 MOCK_NO_ROUTE}.
     */
    private MockResponse unrouted(MockRequest request) {
        var matcher = DOCUMENT_REQUEST.matcher(request.path());
        if (matcher.lookingAt() && scenario.rights().stream()
                .anyMatch(right -> right.repository().equals(matcher.group(1)))) {
            return json(404, object().put(OUTCOME, "NOT_FOUND"));
        }
        return noRoute(request);
    }

    /** The answer a built-in handler computes; the switch is exhaustive over {@link Handler}. */
    private MockResponse handled(Handler handler, Route route, MockRequest request, Map<String, String> captures) {
        return switch (handler) {
            case RENDER_ASCIIDOC -> renderAsciiDoc(request);
            case SEARCH_DOCUMENTS -> searchDocuments(request, route.body());
            case CATALOG_ENTRY -> catalogEntry(request, route.body(), captures.getOrDefault("id", ""));
        };
    }

    /**
     * The entry requests of one catalog over its data file (doc/specification/rest-api.adoc, <em>The Entries</em>):
     * {@code GET} reads the entry as the file holds it, {@code PUT} answers {@code SAVED} (a retired entry
     * {@code 409 RETIRED}), {@code POST .../retirement} answers {@code RETIRED}; an unknown id is
     * {@code 404 NOT_FOUND}. The mock stores nothing: a state decides what the next read shows.
     */
    private MockResponse catalogEntry(MockRequest request, JsonNode data, String id) {
        String catalog = data.path("catalog").asText();
        JsonNode found = null;
        for (var entry : data.path("entries")) {
            if (id.equals(entry.path("id").asText())) {
                found = entry;
                break;
            }
        }
        if (found == null) {
            return json(404, object().put(OUTCOME, "NOT_FOUND"));
        }
        boolean retirement = request.path().endsWith("/retirement");
        return switch (request.method()) {
            case GET -> {
                ObjectNode body = object().put("catalog", catalog).put("id", id).put("name", found.path("name").asText())
                        .put("retired", found.path("retired").asBoolean(false));
                body.set("value", found.path("value"));
                body.set("effective", found.path("effective"));
                body.put("at", found.path("at").asText());
                body.set("history", found.path("history"));
                yield json(200, body);
            }
            case "PUT" -> found.path("retired").asBoolean(false) ? json(409, object().put(OUTCOME, "RETIRED"))
                    : json(200, object().put(OUTCOME, "SAVED").put("catalog", catalog).put("id", id)
                    .put("at", CATALOG_SAVED_AT));
            case POST -> retirement ? json(200, object().put(OUTCOME, "RETIRED").put("catalog", catalog).put("id", id)
                    .put("at", CATALOG_RETIRED_AT)) : noRoute(request);
            default -> noRoute(request);
        };
    }

    /**
     * {@code GET /api/v1/search?q=}: the documents of the index whose title or id contains the text, among the
     * repositories the scenario's rights grant {@code read} on (doc/specification/rest-api.adoc, the search).
     */
    private MockResponse searchDocuments(MockRequest request, JsonNode index) {
        var parameter = request.queryParameter("q");
        if (parameter.isEmpty()) {
            return invalid("/q", "REQUIRED");
        }
        String text = parameter.get().strip();
        if (text.length() < SEARCH_MIN) {
            return invalid("/q", "MIN_LENGTH");
        }
        if (text.length() > SEARCH_MAX) {
            return invalid("/q", "MAX_LENGTH");
        }
        String needle = text.toLowerCase(Locale.ROOT);
        Set<String> readable = new HashSet<>();
        scenario.rights().stream().filter(right -> right.actions().contains("read"))
                .forEach(right -> readable.add(right.repository()));
        List<JsonNode> hits = new ArrayList<>();
        index.path("entries").forEach(entry -> {
            if (readable.contains(entry.path("repository").asText())
                    && (entry.path("title").asText().toLowerCase(Locale.ROOT).contains(needle)
                    || entry.path("id").asText().toLowerCase(Locale.ROOT).contains(needle))) {
                hits.add(entry);
            }
        });
        hits.sort(Comparator.comparing(entry -> entry.path("title").asText().toLowerCase(Locale.ROOT)));
        ObjectNode body = object().put("query", text);
        var results = body.putArray("results");
        hits.stream().limit(SEARCH_LIMIT).forEach(results::add);
        body.put("truncated", hits.size() > SEARCH_LIMIT);
        return json(200, body);
    }

    /**
     * {@code POST /api/v1/render/asciidoc}: the deterministic preview of {@link AsciiDocPreview}. The source is not
     * logged; the refusals are those of doc/specification/rest-api.adoc, <em>Form Kit Requests</em>.
     */
    private MockResponse renderAsciiDoc(MockRequest request) {
        var body = parseBody(request);
        var source = body.path("source");
        if (!body.isObject() || source.isMissingNode()) {
            return invalid("/source", "REQUIRED");
        }
        if (!source.isTextual()) {
            return invalid("/source", "TYPE");
        }
        String text = source.asText();
        if (text.getBytes(StandardCharsets.UTF_8).length > AsciiDocPreview.LIMIT_BYTES) {
            return json(413, object().put(OUTCOME, "TOO_LARGE").put("limit", AsciiDocPreview.LIMIT_BYTES));
        }
        return json(200, object().put("html", AsciiDocPreview.render(text)));
    }

    private ObjectNode sessionBody(MockSession session) {
        boolean firstLogin = scenario.firstLoginRequired(state);
        var user = object();
        String pseudonym = scenario.user().pseudonym();
        if (firstLogin || pseudonym == null) {
            user.putNull("pseudonym");
        } else {
            user.put("pseudonym", pseudonym);
        }
        user.put("name", scenario.user().name());
        ObjectNode body = object();
        body.set("user", user);
        ArrayNode rights = body.putArray("rights");
        scenario.rights().forEach(right -> {
            var entry = rights.addObject().put("repository", right.repository());
            var actions = entry.putArray("actions");
            right.actions().forEach(actions::add);
        });
        body.put("csrfToken", session.csrfToken());
        body.put("firstLoginRequired", firstLogin);
        body.put("directoryConfirmationDue", scenario.directoryConfirmationDue(state));
        return body;
    }

    private MockResponse messages(MockRequest request) {
        String language = request.queryParameter("lang").orElse(MessageCatalogue.DEFAULT_LANGUAGE);
        return catalogue.messages(language).map(messages -> {
            ObjectNode body = object();
            messages.forEach(body::put);
            return json(200, body);
        }).orElseGet(() -> validation("/lang", "UNSUPPORTED"));
    }

    /**
     * The login start. A route of the scenario for it is the answer, as it is for the callback; otherwise, with the
     * identity provider, the mock signs in without asking, and with local users it sends the browser to the web
     * app's login page.
     */
    private MockResponse login(MockRequest request) {
        lock.lock();
        try {
            var route = scenario.route(state, request.method(), request.path(), request.queryParameters());
            if (route.isPresent()) {
                return permitted(route.get().requires()) ? navigation(request, route.get()) : forbidden();
            }
            String target = addresses.checkReturn(request.queryParameter("return").orElse(null));
            if (scenario.login().isLocal()) {
                return MockResponse.text(302, MockResponse.HTML, "").withHeader(LOCATION,
                        LOCAL_LOGIN_PAGE + "?return=" + URLEncoder.encode(target, StandardCharsets.UTF_8));
            }
            if (scenario.route(state, CALLBACK_ROUTE).isPresent()) {
                String callback = escapeHtml(CALLBACK_PATH + "?code=mock&state=mock&iss=mock");
                return MockResponse.text(200, MockResponse.HTML, page("Audit Notary mock login",
                        "<p><a href=\"" + callback + "\">Continue</a></p>", callback));
            }
            String escaped = escapeHtml(target);
            return MockResponse.text(200, MockResponse.HTML, page("Audit Notary mock login",
                    "<p><a href=\"" + escaped + "\">Continue</a></p>", escaped))
                    .withHeader(SET_COOKIE, startSession());
        } finally {
            lock.unlock();
        }
    }

    /** The callback of the identity provider: only a scenario that defines it answers; the mock has no built-in one. */
    private Optional<MockResponse> callback(MockRequest request) {
        lock.lock();
        try {
            return scenario.route(state, request.method(), request.path(), request.queryParameters())
                    .map(route -> permitted(route.requires()) ? navigation(request, route) : forbidden());
        } finally {
            lock.unlock();
        }
    }

    /**
     * Answers the route of the login start or the callback. A refusal that has a page of its own is answered to a
     * browser navigation ({@code Accept} contains {@code text/html}) as {@code 303} to {@code /login-problem}, and to
     * every other client as the JSON of the route.
     */
    private MockResponse navigation(MockRequest request, Route route) {
        String reason = LOGIN_PROBLEMS.get(route.body().path(OUTCOME).asText(""));
        boolean browser = request.header("Accept").map(accept -> accept.contains("text/html")).orElse(false);
        if (reason != null && browser) {
            return MockResponse.text(303, MockResponse.HTML, "").withHeader(LOCATION, LOGIN_PROBLEM + reason);
        }
        return answer(route.status(), route.body());
    }

    /**
     * {@code POST /j_security_check} of the local login: the origin must be the own one, then a known user gets a
     * session and an empty {@code 200}, anyone else an empty {@code 401}. The password is never logged or recorded.
     */
    private MockResponse securityCheck(MockRequest request) {
        lock.lock();
        try {
            if (!POST.equals(request.method()) || !scenario.login().isLocal()) {
                return noRoute(request);
            }
            if (!request.header("Origin").map(ownOrigin(request)::equals).orElse(false)) {
                return json(403, object().put(OUTCOME, "CSRF_REJECTED"));
            }
            var form = formFields(request.body());
            var user = scenario.login().authenticate(form.getOrDefault("j_username", ""),
                    form.getOrDefault("j_password", ""));
            if (user.isEmpty()) {
                return MockResponse.text(401, MockResponse.TEXT, "");
            }
            return MockResponse.text(200, MockResponse.TEXT, "").withHeader(SET_COOKIE, startSession());
        } finally {
            lock.unlock();
        }
    }

    /** Creates a session and returns its {@code Set-Cookie} value. */
    private String startSession() {
        var session = new MockSession(token(), token());
        sessions.put(session.id(), session);
        return SESSION_COOKIE + "=" + session.id() + "; HttpOnly; SameSite=Strict; Path=/";
    }

    private String loginAddress() {
        lock.lock();
        try {
            return scenario.login().isLocal() ? LOCAL_LOGIN_PAGE : LOGIN_PATH;
        } finally {
            lock.unlock();
        }
    }

    /** A JSON answer of the scenario; a refused step-up or login carries {@code Retry-After}. */
    private MockResponse answer(int status, JsonNode body) {
        var response = json(status, body);
        return status == 503 && TOO_MANY_LOGINS.equals(body.path(OUTCOME).asText()) ? response.withHeader(
                "Retry-After", "60") : response;
    }

    private boolean passesCsrf(MockRequest request, MockSession session) {
        if (!request.header(CSRF_HEADER).map(session.csrfToken()::equals).orElse(false)) {
            return false;
        }
        var origin = request.header("Origin");
        return origin.isEmpty() || origin.get().equals(ownOrigin(request));
    }

    /**
     * The origin of the application as the browser sees it: the forwarded host of the Vite proxy
     * ({@code xfwd: true}), otherwise the {@code Host} header.
     *
     * @param request the request
     * @return {@code <scheme>://<host>}
     */
    static String ownOrigin(MockRequest request) {
        var forwardedHost = request.header("X-Forwarded-Host");
        if (forwardedHost.isPresent()) {
            String proto = request.header("X-Forwarded-Proto").orElse("http");
            return proto + "://" + forwardedHost.get().split(",")[0].trim();
        }
        return "http://" + request.header("Host").orElse("");
    }

    private MockResponse control(MockRequest request) {
        String key = request.method() + " " + request.path();
        lock.lock();
        try {
            if (key.startsWith(POST + " /mock/goto/")) {
                String target = request.path().substring("/mock/goto/".length());
                var found = scenario.state(target);
                if (found.isEmpty()) {
                    String reference = scenario.name() + "#" + target;
                    LOGGER.warn(WebMockLogMessages.WARN.UNKNOWN_REFERENCE, reference);
                    return json(404, object().put(OUTCOME, "MOCK_UNKNOWN_STATE").put("state", target));
                }
                publishStatus(found.get());
                enter(found.get(), 0);
                return json(200, stateBody());
            }
            return switch (key) {
                case GET + " /mock/state" -> json(200, stateBody());
                case GET + " /mock/scenarios" -> {
                    ObjectNode body = object();
                    var primary = body.putArray("primary");
                    registry.primaryNames().forEach(primary::add);
                    yield json(200, body);
                }
                case POST + " /mock/scenario" -> switchScenario(request);
                case POST + " /mock/reset" -> {
                    acts.clear();
                    var start = scenario.state(scenario.start()).orElseThrow();
                    publishStatus(start);
                    enter(start, 0);
                    yield json(200, stateBody());
                }
                case POST + " /mock/broadcast" -> broadcast(request);
                case GET + " /mock/acts" -> json(200, mapper.valueToTree(acts));
                case "DELETE /mock/acts" -> {
                    acts.clear();
                    yield json(200, object().put(OUTCOME, "OK"));
                }
                case POST + " /mock/sessions/clear" -> {
                    sessions.clear();
                    yield json(200, object().put(OUTCOME, "OK"));
                }
                default -> noRoute(request);
            };
        } finally {
            lock.unlock();
        }
    }

    private MockResponse switchScenario(MockRequest request) {
        var body = parseBody(request);
        String reference = body.path(SCENARIO_FIELD).asText(request.queryParameter("name").orElse(""));
        if (reference.isBlank()) {
            return validation("/scenario", "REQUIRED");
        }
        try {
            var resolved = registry.resolve(reference);
            if (resolved.isEmpty()) {
                LOGGER.warn(WebMockLogMessages.WARN.UNKNOWN_REFERENCE, reference);
                return json(404, object().put(OUTCOME, "MOCK_UNKNOWN_SCENARIO").put(SCENARIO_FIELD, reference));
            }
            scenario = resolved.get().scenario();
            acts.clear();
            var target = scenario.state(resolved.get().state()).orElseThrow();
            publishStatus(target);
            enter(target, 0);
            LOGGER.info(WebMockLogMessages.INFO.SCENARIO_SWITCHED, scenario.name(), state.id());
            return json(200, stateBody());
        } catch (ScenarioValidationException e) {
            LOGGER.error(WebMockLogMessages.ERROR.SCENARIO_INVALID, reference, e.getMessage());
            return json(422, object().put(OUTCOME, "MOCK_INVALID_SCENARIO").put("detail", e.getMessage()));
        }
    }

    private MockResponse broadcast(MockRequest request) {
        var body = parseBody(request);
        String event = body.path("event").asText("");
        if (event.isBlank()) {
            return validation("/event", "REQUIRED");
        }
        var data = body.path("data");
        broadcaster.publish(event, data.isMissingNode() ? object() : data);
        return json(200, object().put(OUTCOME, "OK"));
    }

    private ObjectNode stateBody() {
        ObjectNode body = object().put(SCENARIO_FIELD, scenario.name()).put("state", state.id())
                .put("description", state.description())
                .put("first_login_required", scenario.firstLoginRequired(state))
                .put("directory_confirmation_due", scenario.directoryConfirmationDue(state))
                .put("timing", timing.name().toLowerCase(Locale.ROOT));
        var links = body.putArray("links");
        state.links().values().forEach(link -> links.addObject().put("name", link.name())
                .put("method", link.method()).put("path", link.key().target()).put("next", link.next()));
        return body;
    }

    /**
     * Enters a state: cancels the pending events and transitions of the previous state, then plays the state's
     * events and its timed transition. Called with the lock held.
     */
    private void enter(ScenarioState target, int depth) {
        state = target;
        long current = ++generation;
        if (target.sessionEnded()) {
            sessions.clear();
            broadcaster.endStreams();
        }
        if (target.sessionReplaced()) {
            sessions.replaceAll((id, session) -> new MockSession(id, token()));
            broadcaster.endStreams();
        }
        if (timing == Timing.ORDERED) {
            target.events().forEach(event -> broadcaster.publish(event.event(), event.data()));
            var auto = target.auto();
            if (auto != null && depth < ORDERED_DEPTH_LIMIT) {
                enter(scenario.state(auto.next()).orElseThrow(), depth + 1);
            }
            return;
        }
        target.events().forEach(event -> scheduler.schedule(() -> whenCurrent(current,
                () -> broadcaster.publish(event.event(), event.data())), event.afterMs(), TimeUnit.MILLISECONDS));
        var auto = target.auto();
        if (auto != null) {
            scheduler.schedule(() -> whenCurrent(current, () -> enter(scenario.state(auto.next()).orElseThrow(), 0)),
                    auto.afterMs(), TimeUnit.MILLISECONDS);
        }
    }

    private void whenCurrent(long expected, Runnable action) {
        lock.lock();
        try {
            if (generation == expected) {
                action.run();
            }
        } finally {
            lock.unlock();
        }
    }

    /** Announces the status a state answers, before the state's own events are played. */
    private void publishStatus(ScenarioState target) {
        scenario.route(target, STATUS_ROUTE).ifPresent(route -> broadcaster.publish("status", route.body()));
    }

    private JsonNode parseBody(MockRequest request) {
        if (request.body().isBlank()) {
            return JsonNodeFactory.instance.nullNode();
        }
        if (request.header("Content-Type").map(type -> type.startsWith(FORM)).orElse(false)) {
            ObjectNode form = object();
            formFields(request.body()).forEach(form::put);
            return form;
        }
        try {
            return mapper.readTree(request.body());
        } catch (JsonProcessingException e) {
            LOGGER.warn(WebMockLogMessages.WARN.MALFORMED_BODY, request.method(), request.path());
            return JsonNodeFactory.instance.textNode(request.body());
        }
    }

    /**
     * The fields of a request body that carry a credential: the step-up password of a release (AUN-WEB-6) and the
     * password of the local login.
     */
    private static final Set<String> CREDENTIAL_FIELDS = Set.of("password", "j_password");

    /** The fields of a form body, decoded, in the order they were sent. */
    private static Map<String, String> formFields(String body) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (String pair : body.split("&")) {
            if (pair.isEmpty()) {
                continue;
            }
            int equals = pair.indexOf('=');
            String name = URLDecoder.decode(equals < 0 ? pair : pair.substring(0, equals), StandardCharsets.UTF_8);
            fields.putIfAbsent(name, equals < 0 ? "" : URLDecoder.decode(pair.substring(equals + 1),
                    StandardCharsets.UTF_8));
        }
        return fields;
    }

    /** The text that stands for a credential in a recorded act. */
    static final String REDACTED = "[redacted]";

    /**
     * Masks the credentials of a request body before it is recorded: `/mock/acts` answers without login, so a
     * password sent with a release must not be readable there.
     *
     * @param body the parsed body
     * @return the body, with every credential field at any depth replaced by {@value #REDACTED}
     */
    static JsonNode redacted(JsonNode body) {
        if (body instanceof ObjectNode object) {
            var copy = JsonNodeFactory.instance.objectNode();
            object.properties().forEach(entry -> copy.set(entry.getKey(),
                    CREDENTIAL_FIELDS.contains(entry.getKey()) ? JsonNodeFactory.instance.textNode(REDACTED)
                            : redacted(entry.getValue())));
            return copy;
        }
        if (body instanceof ArrayNode array) {
            var copy = JsonNodeFactory.instance.arrayNode();
            array.forEach(element -> copy.add(redacted(element)));
            return copy;
        }
        return body;
    }

    /**
     * The answer to a body above {@link #MAX_BODY_BYTES}: {@code 413 TOO_LARGE} with the limit of the only request
     * that takes a large text, the AsciiDoc source (doc/specification/rest-api.adoc, <em>Form Kit Requests</em>). The
     * adapter answers it before it buffers the rest of the body.
     *
     * @return the refusal
     */
    public MockResponse bodyTooLarge() {
        return json(413, object().put(OUTCOME, "TOO_LARGE").put("limit", AsciiDocPreview.LIMIT_BYTES));
    }

    private MockResponse noRoute(MockRequest request) {
        return json(404, object().put(OUTCOME, "MOCK_NO_ROUTE").put("method", request.method())
                .put("path", request.path()));
    }

    private MockResponse validation(String pointer, String code) {
        return refusal(400, pointer, code);
    }

    /** A refusal of a form kit request: {@code 422 VALIDATION}. */
    private MockResponse invalid(String pointer, String code) {
        return refusal(422, pointer, code);
    }

    private MockResponse refusal(int status, String pointer, String code) {
        ObjectNode body = object().put(OUTCOME, "VALIDATION");
        body.putArray("errors").addObject().put("pointer", pointer).put("code", code);
        return json(status, body);
    }

    private MockResponse json(int status, JsonNode body) {
        try {
            return MockResponse.text(status, MockResponse.JSON, mapper.writeValueAsString(body));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Answer cannot be written", e);
        }
    }

    private static ObjectNode object() {
        return JsonNodeFactory.instance.objectNode();
    }

    private String token() {
        var bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String page(String title, String content, @Nullable String refresh) {
        String meta = refresh == null ? "" : "<meta http-equiv=\"refresh\" content=\"0;url=" + refresh + "\">";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" + meta + "<title>" + title
                + "</title></head><body>" + content + "</body></html>";
    }

    /**
     * Escapes text for an HTML attribute or element.
     *
     * @param text the text
     * @return the text with {@code & < > " '} replaced by entities
     */
    static String escapeHtml(String text) {
        var escaped = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            switch (c) {
                case '&' -> escaped.append("&amp;");
                case '<' -> escaped.append("&lt;");
                case '>' -> escaped.append("&gt;");
                case '"' -> escaped.append("&quot;");
                case '\'' -> escaped.append("&#39;");
                default -> escaped.append(c);
            }
        }
        return escaped.toString();
    }

    /** Stops the timer and ends every event stream. */
    @Override
    public void close() {
        scheduler.shutdownNow();
        broadcaster.close();
    }
}

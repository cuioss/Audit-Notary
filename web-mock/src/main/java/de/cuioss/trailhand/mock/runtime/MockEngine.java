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
package de.cuioss.trailhand.mock.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import de.cuioss.tools.logging.CuiLogger;
import de.cuioss.trailhand.mock.WebMockLogMessages;
import de.cuioss.trailhand.mock.scenario.Link;
import de.cuioss.trailhand.mock.scenario.Scenario;
import de.cuioss.trailhand.mock.scenario.ScenarioReference;
import de.cuioss.trailhand.mock.scenario.ScenarioRegistry;
import de.cuioss.trailhand.mock.scenario.ScenarioState;
import de.cuioss.trailhand.mock.scenario.ScenarioValidationException;
import org.jspecify.annotations.Nullable;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
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

/**
 * The engine of the web mock: answers the requests of the web app from the active scenario and emulates what the
 * browser sees of the real application (doc/specification/testing.adoc, TRH-TEST-1).
 * <p>
 * Order of handling: the control routes under {@code /mock/}; the public requests (status, messages, login); the
 * session check; the anti-CSRF and {@code Origin} check of state-changing requests; the first-login restriction;
 * the built-in session, logout and event stream; the links of the current state; the routes of the state, then of
 * the scenario; otherwise {@code 404 MOCK_NO_ROUTE}.
 */
public final class MockEngine implements AutoCloseable {

    /** The cookie of the emulated session. Not {@code Secure}: the mock runs on plain HTTP behind the Vite proxy. */
    public static final String SESSION_COOKIE = "trailhand-mock-session";

    /** The header of the anti-CSRF token. */
    public static final String CSRF_HEADER = "X-CSRF-Token";

    /** The prefix of every request of the web app. */
    private static final String API = "/api/v1/";

    /** The login address the {@code 401} answer names. */
    public static final String LOGIN_PATH = API + "auth/login";

    /** The page the emulated logout leads to. */
    public static final String SIGNED_OUT_PATH = API + "auth/mock-signed-out";

    private static final CuiLogger LOGGER = new CuiLogger(MockEngine.class);

    private static final String MOCK = "/mock/";
    private static final String GET = "GET";
    private static final String POST = "POST";
    private static final String OUTCOME = "outcome";
    private static final String STATUS_ROUTE = GET + " " + API + "status";
    private static final String SCENARIO_FIELD = "scenario";
    private static final String EVENTS_PATH = API + "events";
    private static final int ORDERED_DEPTH_LIMIT = 64;

    /** The requests answered during the first login (doc/specification/directory.adoc, TRH-DIR-2). */
    private static final Set<String> FIRST_LOGIN_ALLOWED = Set.of("GET /api/v1/directory/me",
            "PUT /api/v1/directory/me", "GET /api/v1/catalogs/team", "GET /api/v1/catalogs/role",
            "GET /api/v1/session", "GET /api/v1/messages", STATUS_ROUTE, "POST /api/v1/auth/logout",
            "GET " + EVENTS_PATH, "GET " + LOGIN_PATH, "GET " + SIGNED_OUT_PATH);

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
        if (!path.startsWith(API)) {
            return noRoute(request);
        }
        String key = request.method() + " " + path;
        Optional<MockResponse> open = publicRequest(request, key);
        if (open.isPresent()) {
            return open.get();
        }
        var session = request.cookie(SESSION_COOKIE).map(sessions::get);
        if (session.isEmpty()) {
            return json(401, object().put(OUTCOME, "UNAUTHENTICATED").put("login", LOGIN_PATH));
        }
        if (request.isStateChanging() && !passesCsrf(request, session.get())) {
            return json(403, object().put(OUTCOME, "CSRF_REJECTED"));
        }
        lock.lock();
        try {
            if (request.isStateChanging()) {
                acts.add(new Act(request.method(), path, state.id(), parseBody(request)));
            }
            if (scenario.firstLoginRequired(state) && !FIRST_LOGIN_ALLOWED.contains(key)) {
                return json(403, object().put(OUTCOME, "FIRST_LOGIN_REQUIRED"));
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
            case "GET " + LOGIN_PATH -> Optional.of(login(request));
            case "GET " + SIGNED_OUT_PATH -> Optional.of(MockResponse.text(200, MockResponse.HTML, page(
                    "TrailHand mock: signed out", "<p>The mock session ended.</p><p><a href=\"" + LOGIN_PATH
                    + "?return=/\">Sign in again</a></p>", null)));
            default -> Optional.empty();
        };
    }

    private Optional<MockResponse> builtIn(String key, MockSession session) {
        return switch (key) {
            case "GET /api/v1/session" -> Optional.of(json(200, sessionBody(session)));
            case "POST /api/v1/auth/logout" -> {
                sessions.remove(session.id());
                yield Optional.of(json(200, object().put("redirect", SIGNED_OUT_PATH)).withHeader("Set-Cookie",
                        SESSION_COOKIE + "=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/"));
            }
            case "GET " + EVENTS_PATH -> Optional.of(MockResponse.openEventStream());
            default -> Optional.empty();
        };
    }

    private MockResponse scenarioAnswer(MockRequest request, String key) {
        Optional<Link> link = state.linkFor(request.method(), request.path());
        if (link.isPresent()) {
            var taken = link.get();
            if (!taken.next().equals(state.id())) {
                enter(scenario.state(taken.next()).orElseThrow(), 0);
            }
            return json(taken.status(), taken.body());
        }
        return scenario.route(state, key).map(route -> json(route.status(), route.body()))
                .orElseGet(() -> noRoute(request));
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

    private MockResponse login(MockRequest request) {
        String target = addresses.checkReturn(request.queryParameter("return").orElse(null));
        var session = new MockSession(token(), token());
        sessions.put(session.id(), session);
        String escaped = escapeHtml(target);
        return MockResponse.text(200, MockResponse.HTML, page("TrailHand mock login",
                "<p><a href=\"" + escaped + "\">Continue</a></p>", escaped))
                .withHeader("Set-Cookie", SESSION_COOKIE + "=" + session.id() + "; HttpOnly; SameSite=Strict; Path=/");
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
                .put("timing", timing.name().toLowerCase(Locale.ROOT));
        var links = body.putArray("links");
        state.links().values().forEach(link -> links.addObject().put("name", link.name())
                .put("method", link.method()).put("path", link.path()).put("next", link.next()));
        return body;
    }

    /**
     * Enters a state: cancels the pending events and transitions of the previous state, then plays the state's
     * events and its timed transition. Called with the lock held.
     */
    private void enter(ScenarioState target, int depth) {
        state = target;
        long current = ++generation;
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
        try {
            return mapper.readTree(request.body());
        } catch (JsonProcessingException e) {
            LOGGER.warn(WebMockLogMessages.WARN.MALFORMED_BODY, request.method(), request.path());
            return JsonNodeFactory.instance.textNode(request.body());
        }
    }

    private MockResponse noRoute(MockRequest request) {
        return json(404, object().put(OUTCOME, "MOCK_NO_ROUTE").put("method", request.method())
                .put("path", request.path()));
    }

    private MockResponse validation(String pointer, String code) {
        ObjectNode body = object().put(OUTCOME, "VALIDATION");
        body.putArray("errors").addObject().put("pointer", pointer).put("code", code);
        return json(400, body);
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

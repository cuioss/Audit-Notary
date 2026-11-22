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
package de.cuioss.notary.audit.mock.scenario;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Reads a scenario file and checks it against the scenario format (format version {@value #FORMAT_VERSION}).
 * <p>
 * Rules: the format version is {@value #FORMAT_VERSION}; name, user name and start are present; the start state and
 * every {@code next} of a link or a timed transition name an existing state; a route key is {@code "METHOD /path"}
 * and every method is {@code GET}, {@code POST}, {@code PUT} or {@code DELETE}; every path starts with
 * {@value #API_PREFIX}; a status lies between 100 and 599; the actions of a right are those of
 * {@link Right#ACTIONS}; a delay is not negative. A violation throws a {@link ScenarioValidationException} naming
 * the source, the location and the rule.
 */
public final class ScenarioLoader {

    /** The only supported format version. */
    public static final int FORMAT_VERSION = 1;

    /** The prefix every mocked path carries. */
    public static final String API_PREFIX = "/api/v1/";

    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "DELETE");
    private static final Pattern ROUTE_KEY = Pattern.compile("([A-Z]+) (\\S+)");
    private static final String STATES = "states";
    private static final String ROUTES = "routes";
    private static final String NO_STATE = "names no state: ";
    private static final String STATUS = "status";

    private final ObjectMapper mapper;

    /**
     * Creates a loader.
     *
     * @param mapper the mapper that parses the JSON text
     */
    public ScenarioLoader(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Parses and checks a scenario file.
     *
     * @param source the file or resource name, used in messages
     * @param text   the JSON text
     * @return the checked scenario
     * @throws ScenarioValidationException if the text is no JSON object or breaks a rule
     */
    public Scenario parse(String source, String text) {
        JsonNode root;
        try {
            root = mapper.readTree(text);
        } catch (JsonProcessingException e) {
            throw new ScenarioValidationException(source, "$", "not valid JSON: " + e.getOriginalMessage());
        }
        return read(source, root);
    }

    /**
     * Checks a parsed scenario file.
     *
     * @param source the file or resource name, used in messages
     * @param root   the parsed JSON
     * @return the checked scenario
     * @throws ScenarioValidationException if the JSON breaks a rule
     */
    public Scenario read(String source, @Nullable JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new ScenarioValidationException(source, "$", "a scenario must be a JSON object");
        }
        var context = new Context(source);
        int version = root.path("format_version").asInt(-1);
        if (version != FORMAT_VERSION) {
            throw context.fail("format_version", "must be " + FORMAT_VERSION);
        }
        String name = requiredText(context, root, "name");
        String description = root.path("description").asText("");
        var user = readUser(context, root.path("user"));
        var rights = readRights(context, root.path("rights"));
        boolean firstLogin = readBoolean(context, root, "first_login_required", false);
        String start = requiredText(context, root, "start");
        var routes = readRoutes(context, ROUTES, root.path(ROUTES));
        var statesNode = root.path(STATES);
        if (!statesNode.isObject() || statesNode.isEmpty()) {
            throw context.fail(STATES, "at least one state is required");
        }
        Map<String, ScenarioState> states = new LinkedHashMap<>();
        statesNode.properties().forEach(entry -> states.put(entry.getKey(),
                readState(context, entry.getKey(), entry.getValue())));
        if (!states.containsKey(start)) {
            throw context.fail("start", NO_STATE + start);
        }
        for (var state : states.values()) {
            checkTargets(context, state, states);
        }
        return new Scenario(name, description, user, rights, firstLogin, start, routes, states);
    }

    private static ScenarioUser readUser(Context context, JsonNode node) {
        if (!node.isObject()) {
            throw context.fail("user", "an object with name is required");
        }
        String name = requiredText(context, node, "name");
        var pseudonymNode = node.path("pseudonym");
        String pseudonym = pseudonymNode.isTextual() ? pseudonymNode.asText() : null;
        List<String> groups = new ArrayList<>();
        node.path("groups").forEach(group -> groups.add(group.asText()));
        return new ScenarioUser(pseudonym, name, groups);
    }

    private static List<Right> readRights(Context context, JsonNode node) {
        List<Right> rights = new ArrayList<>();
        if (node.isMissingNode()) {
            return rights;
        }
        if (!node.isArray()) {
            throw context.fail("rights", "must be an array");
        }
        int index = 0;
        for (var entry : node) {
            String location = "rights[" + index + "]";
            String repository = requiredText(context.at(location), entry, "repository");
            List<String> actions = new ArrayList<>();
            for (var action : entry.path("actions")) {
                if (!Right.ALLOWED_ACTIONS.contains(action.asText())) {
                    throw context.fail(location + ".actions", "unknown action: " + action.asText());
                }
                actions.add(action.asText());
            }
            rights.add(new Right(repository, actions));
            index++;
        }
        return rights;
    }

    private ScenarioState readState(Context context, String id, JsonNode node) {
        String location = STATES + "." + id;
        if (!node.isObject()) {
            throw context.fail(location, "a state must be an object");
        }
        var firstLoginNode = node.path("first_login_required");
        Boolean firstLogin = null;
        if (!firstLoginNode.isMissingNode()) {
            if (!firstLoginNode.isBoolean()) {
                throw context.fail(location + ".first_login_required", "must be a boolean");
            }
            firstLogin = firstLoginNode.asBoolean();
        }
        var routes = readRoutes(context, location + "." + ROUTES, node.path(ROUTES));
        Map<String, Link> links = new LinkedHashMap<>();
        node.path("links").properties().forEach(entry -> links.put(entry.getKey(),
                readLink(context, location + ".links." + entry.getKey(), entry.getKey(), entry.getValue())));
        List<ScenarioEvent> events = new ArrayList<>();
        int index = 0;
        for (var event : node.path("events")) {
            String eventLocation = location + ".events[" + index + "]";
            events.add(new ScenarioEvent(delay(context, eventLocation, event),
                    requiredText(context.at(eventLocation), event, "event"), bodyOf(event, "data")));
            index++;
        }
        AutoTransition auto = null;
        var autoNode = node.path("auto");
        if (!autoNode.isMissingNode()) {
            String autoLocation = location + ".auto";
            auto = new AutoTransition(delay(context, autoLocation, autoNode),
                    requiredText(context.at(autoLocation), autoNode, "next"));
        }
        return new ScenarioState(id, node.path("description").asText(""), firstLogin, routes, links, events, auto);
    }

    private Link readLink(Context context, String location, String name, JsonNode node) {
        String method = requiredText(context.at(location), node, "method");
        checkMethod(context, location + ".method", method);
        String path = requiredText(context.at(location), node, "path");
        checkPath(context, location + ".path", path);
        String next = requiredText(context.at(location), node, "next");
        return new Link(name, method, path, next, status(context, location, node), bodyOf(node, "body"));
    }

    private Map<String, Route> readRoutes(Context context, String location, JsonNode node) {
        Map<String, Route> routes = new LinkedHashMap<>();
        if (node.isMissingNode()) {
            return routes;
        }
        if (!node.isObject()) {
            throw context.fail(location, "must be an object");
        }
        node.properties().forEach(entry -> {
            String key = entry.getKey();
            String routeLocation = location + "." + key;
            var matcher = ROUTE_KEY.matcher(key);
            if (!matcher.matches()) {
                throw context.fail(routeLocation, "a route key must be \"METHOD /path\"");
            }
            checkMethod(context, routeLocation, matcher.group(1));
            checkPath(context, routeLocation, matcher.group(2));
            routes.put(key, new Route(status(context, routeLocation, entry.getValue()),
                    bodyOf(entry.getValue(), "body")));
        });
        return routes;
    }

    private static void checkTargets(Context context, ScenarioState state, Map<String, ScenarioState> states) {
        for (var link : state.links().values()) {
            if (!states.containsKey(link.next())) {
                throw context.fail(STATES + "." + state.id() + ".links." + link.name() + ".next",
                        NO_STATE + link.next());
            }
        }
        var auto = state.auto();
        if (auto != null && !states.containsKey(auto.next())) {
            throw context.fail(STATES + "." + state.id() + ".auto.next", NO_STATE + auto.next());
        }
    }

    private static void checkMethod(Context context, String location, String method) {
        if (!METHODS.contains(method)) {
            throw context.fail(location, "method must be one of GET, POST, PUT, DELETE: " + method);
        }
    }

    private static void checkPath(Context context, String location, String path) {
        if (!path.startsWith(API_PREFIX) || path.contains("?")) {
            throw context.fail(location, "path must start with " + API_PREFIX + " and carry no query: " + path);
        }
    }

    private static int status(Context context, String location, JsonNode node) {
        var statusNode = node.path(STATUS);
        if (statusNode.isMissingNode()) {
            return 200;
        }
        int status = statusNode.asInt(-1);
        if (!statusNode.isInt() || status < 100 || status > 599) {
            throw context.fail(location + "." + STATUS, "must be an HTTP status between 100 and 599");
        }
        return status;
    }

    private static long delay(Context context, String location, JsonNode node) {
        var delayNode = node.path("after_ms");
        if (delayNode.isMissingNode()) {
            return 0;
        }
        if (!delayNode.canConvertToLong() || delayNode.asLong() < 0) {
            throw context.fail(location + ".after_ms", "must be a non-negative number");
        }
        return delayNode.asLong();
    }

    private static boolean readBoolean(Context context, JsonNode node, String field, boolean fallback) {
        var value = node.path(field);
        if (value.isMissingNode()) {
            return fallback;
        }
        if (!value.isBoolean()) {
            throw context.fail(field, "must be a boolean");
        }
        return value.asBoolean();
    }

    private static JsonNode bodyOf(JsonNode node, String field) {
        var body = node.path(field);
        return body.isMissingNode() ? JsonNodeFactory.instance.objectNode() : body;
    }

    private static String requiredText(Context context, JsonNode node, String field) {
        var value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw context.fail(field, "a non-blank string is required");
        }
        return value.asText();
    }

    /** The source and the location prefix of messages. */
    private record Context(String source, String prefix) {

        Context(String source) {
            this(source, "");
        }

        Context at(String location) {
            return new Context(source, location + ".");
        }

        ScenarioValidationException fail(String location, String detail) {
            return new ScenarioValidationException(source, prefix + location, detail);
        }
    }
}
